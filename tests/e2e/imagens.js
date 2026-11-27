/* Gestão de imagens: histórico (nada se perde), original guardado, otimização, restaurar, verificação,
   monitorização de falhas no telemóvel, painel Imagens, permissões, e validação visual no menu, nos
   detalhes do produto (verso do cartão) e no POS. Capturas em out/shots/imagens-*.png. */
const ROOT = require('node:path').resolve(__dirname, '../..');
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const { loginClient } = require('./auth-helper');
const sharp = require(ROOT + '/node_modules/sharp');
const B = 'http://localhost:3100';
const OUT = __dirname + '/out/shots';
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execSync('psql -h localhost -p 5433 -U postgres nokau_test -tA', { input: q }).toString().trim();
const PROD = 'Chocos'; // tem descrição: o cartão tem verso (detalhes do produto)
const BROKEN = 'Moelas';

async function login(b, email, pw, opts = { viewport: { width: 1440, height: 900 } }) {
  const p = await (await b.newContext(opts)).newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/admin/login'); await p.getByLabel('Email').fill(email); await p.getByLabel('Palavra-passe').fill(pw);
  await p.getByRole('button', { name: /Entrar/ }).click(); await p.waitForURL((u) => u.pathname.startsWith('/admin/') && u.pathname !== '/admin/login', { timeout: 30000 });
  return p;
}
async function staffPage(b, email) {
  // sessão da equipa criada como o servidor a cria (as palavras-passe destas contas mudam noutros testes)
  const uid = sql(`select id from admin_users where email='${email}' and active`);
  if (!uid) return null;
  const sid = crypto.randomBytes(32).toString('base64url');
  sql(`insert into auth_sessions (id_hash, kind, subject, expires_at) values ('${crypto.createHash('sha256').update(sid).digest('hex')}', 'staff', '${uid}', now() + interval '1 hour')`);
  const value = `${sid}.${crypto.createHmac('sha256', 'test-secret-test-secret-test-secret-123456').update(`sessao:staff:${sid}`).digest('base64url')}`;
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: 'nk_session', value, url: B }]);
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p;
}
async function photo(file, rgb) {
  await sharp({ create: { width: 1600, height: 1200, channels: 3, background: rgb, noise: { type: 'gaussian', mean: 128, sigma: 30 } } }).jpeg({ quality: 90 }).toFile(file);
  return file;
}
async function upload(a, file) {
  await a.goto(B + '/admin/menu', { waitUntil: 'load' }); await sleep(800);
  const li = a.locator('li').filter({ has: a.locator(`text="${PROD}"`) }).filter({ has: a.locator('input[type=checkbox]') }).first();
  await li.getByRole('button', { name: 'Editar' }).click();
  const v0 = sql(`select image_version from menu_items where name='${PROD}'`);
  await li.locator('input[type=file]').setInputFiles(file);
  await li.getByRole('button', { name: 'Guardar alterações' }).click();
  for (let i = 0; i < 40 && sql(`select image_version from menu_items where name='${PROD}'`) === v0; i++) await sleep(500);
}

(async () => {
  execSync(`${__dirname}/servers.sh central`, { stdio: 'pipe' });
  execSync(`mkdir -p ${OUT}`);
  await fetch(B + '/api/health'); // garante a migração
  sql('delete from auth_throttle');
  const id = sql(`select id from menu_items where name='${PROD}'`);
  const bid = sql(`select id from menu_items where name='${BROKEN}'`);
  // estado inicial: produto de teste sem foto (o histórico de execuções anteriores fica — nunca se apaga)
  sql(`update menu_items set image = null, image_type = null, image_path = null where id = ${id}; update menu_item_images set status = 'removed', retired_at = now(), retired_by = 'teste' where item_id = ${id} and status = 'current';`);
  const priceBefore = sql("select string_agg(id||':'||price||':'||name, ',' order by id) from menu_items");

  // 1. migração e consistência
  check(sql("select count(*) from information_schema.tables where table_name in ('menu_item_images','image_failures')") === '2', '1.1 tabelas menu_item_images e image_failures existem');
  check(sql("select count(*) from menu_items i where (i.image is not null or i.image_path is not null) and (select count(*) from menu_item_images h where h.item_id = i.id and h.status = 'current') <> 1") === '0', '1.2 cada produto com imagem tem exatamente 1 versão «atual» no histórico');

  const b = await chromium.launch();
  const a = await login(b, 'gerente@nokau.test', 'senha-forte-123');

  // 2. carregar foto: original guardado + otimizada
  const rows0 = Number(sql(`select count(*) from menu_item_images where item_id = ${id}`));
  await upload(a, await photo(OUT + '/img-teste-1.jpg', { r: 200, g: 90, b: 40 }));
  const h1 = sql(`select id||'|'||source||'|'||status||'|'||original_type||'|'||(original_sha256 = encode(sha256(original),'hex'))||'|'||optimized_type||'|'||width||'|'||(sha256 = encode(sha256(optimized),'hex')) from menu_item_images where item_id = ${id} and status = 'current'`).split('|');
  check(h1[1] === 'upload' && h1[3] === 'image/jpeg' && h1[4] === 'true', `2.1 foto carregada: original guardado (JPEG, SHA-256 confere)`);
  check(h1[5] === 'image/webp' && Number(h1[6]) <= 800 && h1[7] === 'true', `2.2 versão otimizada WebP com ${h1[6]} px de largura (≤ 800), SHA-256 confere`);
  check(sql(`select (i.image = h.optimized) from menu_items i join menu_item_images h on h.item_id = i.id and h.status = 'current' where i.id = ${id}`) === 't', '2.3 o menu usa exatamente a versão otimizada guardada');
  const firstVersion = h1[0];

  // 3. substituir: a anterior fica guardada
  await upload(a, await photo(OUT + '/img-teste-2.jpg', { r: 40, g: 110, b: 200 }));
  check(sql(`select status||'|'||(optimized is not null)||'|'||(original is not null) from menu_item_images where id = '${firstVersion}'`) === 'replaced|true|true', '3.1 substituir: a versão anterior fica «Substituída», com original e otimizada guardados');
  check(Number(sql(`select count(*) from menu_item_images where item_id = ${id}`)) === rows0 + 2, '3.2 histórico tem as 2 versões (nada foi apagado)');

  // 4. remover: o produto fica sem foto, mas a versão fica no histórico
  await a.goto(B + '/admin/menu', { waitUntil: 'load' }); await sleep(800);
  const li = a.locator('li').filter({ has: a.locator(`text="${PROD}"`) }).filter({ has: a.locator('input[type=checkbox]') }).first();
  a.once('dialog', (d) => d.accept()); await li.getByRole('button', { name: 'Remover foto' }).click(); await sleep(2500);
  check(sql(`select (image is null and image_path is null) from menu_items where id = ${id}`) === 't' && sql(`select count(*) from menu_item_images where item_id = ${id} and status = 'removed' and optimized is not null`) !== '0', '4.1 remover: produto sem foto, versão guardada como «Removida»');

  // 5. painel Imagens: restaurar a PRIMEIRA versão
  await a.goto(B + '/admin/imagens', { waitUntil: 'load' }); await sleep(1000);
  check(await a.getByTestId('images-summary').isVisible(), '5.1 painel Imagens abre (Admin)');
  const card = a.getByTestId(`img-item-${id}`);
  await card.getByRole('button', { name: /Histórico/ }).click();
  const hrows = a.getByTestId(`history-${id}`).getByTestId('history-row');
  check(await hrows.count() >= 2, `5.2 histórico do produto visível (${await hrows.count()} versões)`);
  await a.screenshot({ path: OUT + '/imagens-painel.png', fullPage: false });
  const target = a.getByTestId(`history-${id}`).locator(`[data-testid="history-row"]:has(img[src*="${firstVersion}"])`);
  a.once('dialog', (d) => d.accept()); await target.getByRole('button', { name: 'Restaurar' }).click(); await sleep(2500);
  check(sql(`select (i.image = h.optimized) from menu_items i, menu_item_images h where i.id = ${id} and h.id = '${firstVersion}'`) === 't', '5.3 restaurar: o produto volta a mostrar exatamente a 1.ª foto');
  check(sql(`select source||'|'||restored_from from menu_item_images where item_id = ${id} and status = 'current'`) === `restore|${firstVersion}`, '5.4 restauro registado como nova versão, ligada à original');
  check(Number(sql(`select count(*) from menu_item_images where item_id = ${id}`)) === rows0 + 3, '5.5 histórico só cresce (3 versões, nenhuma apagada)');
  await a.screenshot({ path: OUT + '/imagens-painel-restaurado.png' });

  // 6. original descarregável, igual ao guardado; protegido
  const cookies = (await a.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(`${B}/api/admin/menu-image-history/${firstVersion}?f=original`, { headers: { cookie: cookies } });
  const buf = Buffer.from(await res.arrayBuffer());
  check(res.status === 200 && crypto.createHash('sha256').update(buf).digest('hex') === sql(`select original_sha256 from menu_item_images where id = '${firstVersion}'`), '6.1 original descarregado é byte a byte o guardado');
  check((await fetch(`${B}/api/admin/menu-image-history/${firstVersion}?f=original`)).status === 403, '6.2 sem sessão da equipa: 403');

  // 7. verificação no servidor deteta ficheiro em falta
  sql(`update menu_items set image = null, image_type = null, image_path = '/menu/ilustrativas/nao-existe.webp' where id = ${bid}`);
  sql(`delete from image_failures where item_id = ${bid}`);
  await a.goto(B + '/admin/imagens', { waitUntil: 'load' }); await sleep(800);
  await a.getByRole('button', { name: 'Verificar todas as imagens agora' }).click();
  await a.getByTestId('check-result').waitFor({ timeout: 60000 });
  const cr = await a.getByTestId('check-result').innerText();
  check(cr.includes(BROKEN) && /HTTP 404/.test(cr), `7.1 verificação aponta ${BROKEN}: ficheiro indisponível (HTTP 404)`);
  check(sql(`select count(*) from image_failures where item_id = ${bid} and kind = 'server_check'`) === '1', '7.2 falha registada (monitorização)');
  const okCount = cr.match(/(\d+) de (\d+)/); check(okCount && okCount[1] === '1', `7.3 só 1 imagem com problema (${okCount && okCount[0]})`);

  // 8. no telemóvel do cliente: sem ícone de imagem partida, e a falha é avisada
  sql(`delete from image_failures where item_id = ${bid}`);
  const token = sql('select qr_token from dining_tables where active order by number limit 1');
  { const ctx = await b.newContext(devices['Pixel 7']); await loginClient(ctx, B); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${B}/m/${token}`, { waitUntil: 'load' }); await sleep(2000);
    const c = p.locator('li').filter({ has: p.locator(`h3:text-is("${BROKEN}")`) }).first();
    await c.scrollIntoViewIfNeeded(); await sleep(2500);
    check(await c.getByTestId('img-broken').count() >= 1 && await c.locator('img').count() === 0, `8.1 ${BROKEN}: imagem em falta não aparece partida (fundo neutro)`);
    let n = '0'; for (let i = 0; i < 10 && n === '0'; i++) { await sleep(500); n = sql(`select count(*) from image_failures where item_id = ${bid} and kind = 'client_load'`); }
    check(n === '1', '8.2 o telemóvel avisou a falha (registada para o painel)');
    await ctx.close(); }
  const r1 = await fetch(B + '/api/menu-image-falha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: bid, src: 'https://evil.example/x.php' }) });
  check(r1.status === 204 && sql(`select count(*) from image_failures where item_id = ${bid}`) === '1', '8.3 aviso com caminho que não é de imagem do menu: ignorado');
  sql(`update menu_items set image_path = null where id = ${bid}`);

  // 9. validação visual: a foto aparece no menu, nos detalhes (verso do cartão) e no POS
  const restoredSrc = `/api/menu-image/${id}?v=${sql(`select image_version from menu_items where id = ${id}`)}`;
  { const p = await (await b.newContext(devices['Pixel 7'])).newPage();
    let src = null;
    for (let i = 0; i < 8 && src !== restoredSrc; i++) {
      await p.goto(B + '/menu?categoria=peixes-mariscos-grelhados', { waitUntil: 'load' }); await sleep(1500);
      src = await p.locator(`[data-testid^="menu-card-"]:has(h3:text-is("${PROD}")) .flip-front img`).first().getAttribute('src').catch(() => null);
      if (src !== restoredSrc) await sleep(10000);
    }
    const card = p.locator(`[data-testid^="menu-card-"]:has(h3:text-is("${PROD}"))`).first();
    await card.scrollIntoViewIfNeeded(); await sleep(1200);
    check(src === restoredSrc && await card.locator('.flip-front img').evaluate((i) => i.complete && i.naturalWidth > 0), '9.1 menu público: a foto restaurada aparece (carregada)');
    await card.screenshot({ path: OUT + '/imagens-menu-frente.png' });
    await card.locator('.flip-front h3').tap(); await sleep(1300);
    check(await card.locator('.flip-back img').evaluate((i) => i.complete && i.naturalWidth > 0 && new URL(i.src).pathname + new URL(i.src).search), '9.2 detalhes do produto (verso do cartão): miniatura da foto aparece');
    await card.screenshot({ path: OUT + '/imagens-menu-detalhes.png' });
    const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
    check(broken.length === 0, `9.3 menu público: nenhuma imagem partida (${broken.length})`);
    await p.context().close(); }
  { const pos = await login(b, 'gerente@nokau.test', 'senha-forte-123');
    await pos.goto(`${B}/m/${token}`, { waitUntil: 'load' }); await sleep(2000);
    const card = pos.locator('li').filter({ has: pos.locator(`h3:text-is("${PROD}")`) }).first();
    await card.scrollIntoViewIfNeeded(); await sleep(1500);
    check(await card.locator('.flip-front img').evaluate((i, s) => i.getAttribute('src') === s && i.complete && i.naturalWidth > 0, restoredSrc), '9.4 POS (equipa): a foto aparece no produto');
    await card.screenshot({ path: OUT + '/imagens-pos.png' });
    // percorre o menu como uma pessoa (as imagens carregam quando se aproximam do ecrã)
    for (let y = 0; y < 60; y++) { const end = await pos.evaluate(() => { window.scrollBy(0, 700); return window.innerHeight + window.scrollY >= document.body.scrollHeight - 2; }); await sleep(250); if (end) break; }
    await sleep(2000);
    const broken = await pos.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
    // produto a produto: cada produto com imagem mostra-a (carregada) no seu próprio cartão
    const withImg = await pos.evaluate(() => [...document.querySelectorAll('main li')].map((li) => {
      const name = li.querySelector('h3')?.textContent?.trim(); const img = li.querySelector('.flip-front img, :scope > figure img');
      return name && img && img.complete && img.naturalWidth > 0 ? name : null; }).filter(Boolean));
    const expected = sql("select string_agg(i.name, '|' order by i.name) from menu_items i join menu_categories c on c.id = i.category_id where i.active and c.active and (i.image is not null or i.image_path is not null)").split('|');
    const got = [...new Set(withImg)].sort((x, y) => x.localeCompare(y));
    const missing = expected.filter((n) => !got.includes(n)), extra = got.filter((n) => !expected.includes(n));
    check(broken.length === 0 && missing.length === 0 && extra.length === 0, `9.5 POS: os ${expected.length} produtos com imagem mostram-na, nenhuma partida, nenhuma a mais (em falta: ${missing.join(', ') || '—'}; a mais: ${extra.join(', ') || '—'})`);
    await pos.context().close(); }

  // 10. permissões
  sql('delete from auth_throttle');
  { const g = await staffPage(b, 'gerente1@nokau.test');
    check(!!g, '10.0 conta de gerente de teste disponível');
    if (g) { await g.goto(B + '/admin/imagens', { waitUntil: 'load' }); check(new URL(g.url()).pathname === '/admin/imagens', '10.1 Gerente acede ao painel Imagens'); await g.context().close(); } }
  { const w = await staffPage(b, 'garcom1@nokau.test');
    if (w) {
      await w.goto(B + '/admin/imagens', { waitUntil: 'load' }); await sleep(800);
      check(new URL(w.url()).pathname !== '/admin/imagens', '10.2 Garçom não acede ao painel Imagens');
      const r = await w.request.get(`${B}/api/admin/menu-image-history/${firstVersion}`); check(r.status() === 403, '10.3 Garçom não vê o histórico de imagens (403)');
      await w.context().close();
    } else check(false, '10.2 conta de garçom de teste disponível');
  }
  check(sql("select string_agg(id||':'||price||':'||name, ',' order by id) from menu_items") === priceBefore, '11.1 nomes e preços de todos os produtos ficaram iguais');

  // repor: produto de teste sem foto (as versões ficam no histórico)
  sql(`update menu_items set image = null, image_type = null, image_path = null where id = ${id}; update menu_item_images set status = 'removed', retired_at = now(), retired_by = 'teste' where item_id = ${id} and status = 'current';`);
  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n')[0]); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
