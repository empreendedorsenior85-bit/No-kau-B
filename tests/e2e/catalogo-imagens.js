/* Catálogo de imagens (27/11/2026): as 3 fotografias de vinho confirmadas entram SÓ no produto certo, pela
   importação do painel; preços, nomes e categorias não mudam; menu público, menu da mesa e carrinho funcionam. */
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const { loginClient } = require('./auth-helper');
const B = 'http://localhost:3100';
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execSync('psql -h localhost -p 5433 -U postgres nokau_test -tA', { input: q }).toString().trim();
const EXP = {
  'Casa de Santar (750 ml)': '/menu/ilustrativas/vinhos-champagne/casa-de-santar-750ml.webp',
  'Casa de Santar Reserva': '/menu/ilustrativas/vinhos-champagne/casa-de-santar-reserva.webp',
  'Quinta Cabriz Tinto': '/menu/ilustrativas/vinhos-champagne/quinta-cabriz-tinto.webp',
  'Papa Figos': '/menu/ilustrativas/vinhos-champagne/papa-figos.webp',
  'Cacho Fresco (Espumante)': '/menu/ilustrativas/vinhos-champagne/cacho-fresco.webp',
  'Salada de Frango': '/menu/ilustrativas/salada-de-frango.webp',
  'Salada de Tomate': '/menu/ilustrativas/salada-de-tomate.webp',
  'Tábua de Queijo, Enchidos e Azeitonas': '/menu/ilustrativas/tabua-queijo-enchidos.webp',
  'Filete Marinheiro': '/menu/ilustrativas/filete-marinheiro.webp',
  'Espetada de Frango': '/menu/ilustrativas/espetada-de-frango.webp',
  'Cordon Bleu': '/menu/ilustrativas/cordon-bleu.webp',
  'Omelete Simples no Prato': '/menu/ilustrativas/omelete-simples-prato.webp',
  'Omelete de Atum': '/menu/ilustrativas/omelete-de-atum.webp',
  'Gato Azul': '/menu/ilustrativas/vinhos-champagne/gato-azul.webp',
  'Simpote': '/menu/ilustrativas/simpote.webp',
  'Shawarma Simples': '/menu/ilustrativas/shawarma-simples.webp',
  'Fataya Completo': '/menu/ilustrativas/fataya-completo.webp',
};
const NONE = ['Casa de Santar (375 ml)', 'Quinta Cabriz Branco (750 ml)', 'Quinta Cabriz Branco (375 ml)'];
const q = (s) => s.replace(/'/g, "''");

(async () => {
  execSync(`${__dirname}/servers.sh central`, { stdio: 'pipe' });
  sql('delete from auth_throttle');
  // estado inicial idempotente: os 3 produtos sem fotografia
  sql(`update menu_items set image_path = null where name in (${Object.keys(EXP).map((n) => `'${q(n)}'`).join(',')}) and image is null`);
  const snap = () => sql("select id||'|'||category_id||'|'||name||'|'||price||'|'||description||'|'||available||'|'||active from menu_items order by id");
  const before = snap();
  const otherImgs = () => sql("select id||'|'||coalesce(image_path,'') from menu_items where name not in (" + Object.keys(EXP).map((n) => `'${q(n)}'`).join(',') + ") order by id");
  const othersBefore = otherImgs();

  // 1. ficheiros otimizados acessíveis
  for (const [n, u] of Object.entries(EXP)) {
    const r = await fetch(B + u);
    check(r.status === 200 && /image\/webp/.test(r.headers.get('content-type') ?? ''), `1 ${n}: ficheiro ${u.split('/').pop()} é servido (200, WebP)`);
  }

  const b = await chromium.launch();
  // 2. importação real pelo painel (Admin)
  { const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(B + '/admin/login'); await p.getByLabel('Email').fill('gerente@nokau.test'); await p.getByLabel('Palavra-passe').fill('senha-forte-123');
    await p.getByRole('button', { name: /Entrar/ }).click(); await p.waitForURL((u) => u.pathname.startsWith('/admin/') && u.pathname !== '/admin/login', { timeout: 30000 });
    await p.goto(B + '/admin/menu', { waitUntil: 'load' });
    const pend = await p.getByTestId('photos-pending').innerText().catch(() => '');
    check(/\d+ produtos? pode/.test(pend), `2.1 painel avisa que há produtos que podem receber foto ilustrativa («${pend}»)`);
    p.once('dialog', (d) => d.accept()); await p.getByRole('button', { name: 'Importar ementa original' }).click();
    await p.waitForSelector('text=Ementa importada', { timeout: 30000 });
    const msg = await p.locator('text=Ementa importada').first().innerText();
    check(/fotografias ligadas/.test(msg) && /0 produtos novos/.test(msg), `2.2 importação: liga fotografias e não cria produtos (${msg.slice(0, 90)})`);
    await p.context().close(); }

  // 3. base de dados: cada foto só no seu produto; nada mais mudou
  for (const [n, u] of Object.entries(EXP)) check(sql(`select image_path from menu_items where name='${q(n)}'`) === u, `3.1 ${n} → ${u.split('/').pop()}`);
  for (const u of Object.values(EXP)) check(sql(`select count(*) from menu_items where image_path='${u}'`) === '1', `3.2 ${u.split('/').pop()} está num único produto`);
  for (const n of NONE) check(sql(`select coalesce(image_path,'') from menu_items where category_id='vinhos-champagne' and name='${q(n)}'`) === '', `3.3 ${n}: continua sem fotografia (não confirmada)`);
  check(snap() === before, '3.4 nomes, preços, descrições, categorias e disponibilidade de TODOS os produtos ficaram iguais');
  check(otherImgs() === othersBefore, '3.5 nenhum outro produto ganhou ou perdeu fotografia');
  check(sql("select price from menu_items where name='Casa de Santar (750 ml)'") === '12000' && sql("select price from menu_items where name='Casa de Santar Reserva'") === '22000' && sql("select price from menu_items where name='Quinta Cabriz Tinto'") === '12000', '3.6 preços oficiais: 12 000 · 22 000 · 12 000 FCFA');

  // 4. menu da mesa (QR) no telemóvel: imagem certa, etiqueta ilustrativa, carrinho
  const token = sql('select qr_token from dining_tables where active order by number limit 1');
  { const ctx = await b.newContext(devices['Pixel 7']); await loginClient(ctx, B); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${B}/m/${token}`, { waitUntil: 'load' }); await sleep(2500);
    for (const [n, u] of Object.entries(EXP)) {
      const card = p.locator('li').filter({ has: p.locator(`h3:text-is("${n}")`) }).first();
      await card.scrollIntoViewIfNeeded(); await sleep(700);
      const img = card.locator('.flip-front img, img').first();
      const src = await img.getAttribute('src');
      const loaded = await img.evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false);
      check(src === u && loaded, `4.1 mesa: ${n} mostra a sua foto (carregada)`);
      check(await card.getByTestId('illustrative').first().isVisible(), `4.2 mesa: ${n} com a etiqueta «Imagem ilustrativa»`);
    }
    for (const n of ['Casa de Santar (375 ml)', 'Shawarma Nô Kau', 'Fataya Simples', 'Omelete Mista no Prato']) {
      const card = p.locator('li').filter({ has: p.locator(`h3:text-is("${n}")`) }).first();
      check(await card.locator('img').count() === 0, `4.3 mesa: ${n} sem fotografia`);
    }
    await p.getByRole('button', { name: 'Adicionar Casa de Santar (750 ml)', exact: true }).click(); await sleep(400);
    await p.getByRole('button', { name: /Ver pedido/ }).click(); await sleep(600);
    const dlg = await p.getByRole('dialog').innerText();
    check(/Casa de Santar \(750 ml\)/.test(dlg) && /12\s000 FCFA/.test(dlg.replace(/ | /g, ' ')), '4.4 carrinho: Casa de Santar (750 ml) a 12 000 FCFA');
    await ctx.close(); }

  // 5. menu público (página estática revalidada): imagens aparecem após a revalidação
  { const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); p.on('pageerror', (e) => errs.push(e.message));
    let srcs = [];
    for (let i = 0; i < 8; i++) {
      await p.goto(B + '/menu', { waitUntil: 'load' }); await sleep(1500);
      srcs = await p.evaluate(() => [...document.images].map((i) => new URL(i.src).pathname));
      if (Object.values(EXP).every((u) => srcs.includes(u))) break;
      await sleep(12000);
    }
    check(Object.values(EXP).every((u) => srcs.includes(u)), `5.1 menu público: as ${Object.keys(EXP).length} fotos aparecem`);
    for (const [n, u] of Object.entries(EXP)) {
      const card = p.locator('[data-testid^="menu-card-"], li').filter({ has: p.locator(`h3:text-is("${n}")`) }).first();
      check((await card.locator('img').first().getAttribute('src')) === u, `5.2 menu público: ${n} tem a sua foto`);
    }
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 0, '5.3 menu público sem deslocamento horizontal'); }

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n')[0]); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
