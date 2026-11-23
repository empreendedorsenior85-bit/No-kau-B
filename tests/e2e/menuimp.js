/* Importação da ementa original: cada produto, preço e categoria das 3 imagens tem de estar na base e no menu do cliente. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const S = __dirname;
const cat = JSON.parse(fs.readFileSync(`${S}/catalog.json`, 'utf8'));
const B = 'http://localhost:3100', ADMIN = 'gerente@nokau.test', PASS = 'senha-forte-123', G1 = 'gerente1@nokau.test', G1PASS = 'minha-nova-senha-77';
const OUT = require('node:path').join(OUTDIR, 'shots', 'menu');
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`, { maxBuffer: 1 << 26 }).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brl = (n) => new Intl.NumberFormat('pt-PT', { useGrouping: 'always', maximumFractionDigits: 0 }).format(n).replace(/\s/g, ' ');

async function login(ctx, email, pw) {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/401|404|net::ERR/.test(m.text())) errs.push(`${email}: ${m.text().slice(0, 150)}`); });
  p.on('pageerror', (e) => errs.push(`${email} pageerror: ${e.message.slice(0, 150)}`));
  await p.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  await p.waitForURL('**/admin/dashboard', { timeout: 15000 });
  return p;
}

(async () => {
  // limpar restos de testes anteriores (produtos de teste e demonstração)
  sql("delete from menu_items"); // parte de um menu vazio (as categorias antigas voltam a ativas)
  sql("update menu_categories set active = true where id in ('principais','casa','tradicionais','acompanhamentos','sobremesas','bebidas')");
  sql("delete from menu_items where category_id in (select id from menu_categories where id like 'categoria-teste%')");
  sql("delete from menu_categories where id like 'categoria-teste%'");
  // Etapa C: para pedir é preciso conta — todos os contextos destes testes são de um cliente com sessão iniciada
  const b = require('./auth-helper.js').clientContexts(await chromium.launch());
  const actx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const ap = await login(actx, ADMIN, PASS);

  // ---------- 1. importar pelo painel ----------
  await ap.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  check(await ap.locator('[data-testid="import-panel"]').isVisible(), '1.1 painel de importação visível para o Admin');
  ap.once('dialog', (d) => d.accept());
  await ap.getByRole('button', { name: 'Importar ementa original' }).click();
  await ap.waitForSelector('text=Ementa importada', { timeout: 30000 });
  const msg = await ap.locator('text=Ementa importada').first().innerText();
  check(new RegExp(`${cat.items.length} produtos novos`).test(msg), `1.2 mensagem: "${msg}"`);

  // ---------- 2. base de dados = ementa (produto a produto) ----------
  const dbRows = sql("select category_id||'|'||name||'|'||price||'|'||coalesce(description,'')||'|'||coalesce(review_note,'') from menu_items").split('\n');
  const dbMap = new Map(dbRows.map((r) => { const [c, n, p, ...rest] = r.split('|'); return [`${c}|${n}`, { price: Number(p), rest: rest.join('|') }]; }));
  let missing = [], wrongPrice = [], wrongDesc = [];
  for (const it of cat.items) {
    const row = dbMap.get(`${it.cat}|${it.name}`);
    if (!row) { missing.push(it.name); continue; }
    if (row.price !== it.price) wrongPrice.push(`${it.name}: ${row.price} ≠ ${it.price}`);
    if ((it.desc ?? '') !== row.rest.split('|')[0]) wrongDesc.push(it.name);
  }
  check(missing.length === 0, `2.1 todos os ${cat.items.length} produtos estão na base de dados (em falta: ${missing.join(', ') || 'nenhum'})`);
  check(wrongPrice.length === 0, `2.2 todos os preços coincidem com a ementa (${wrongPrice.length} diferenças)`);
  check(wrongDesc.length === 0, `2.3 todas as descrições coincidem (${wrongDesc.length} diferenças)`);
  check(sql('select count(*) from menu_items') === String(cat.items.length), `2.4 existem exatamente ${cat.items.length} produtos (sem extras nem duplicados): ${sql('select count(*) from menu_items')}`);
  check(sql("select count(*) from (select category_id, name from menu_items group by 1,2 having count(*) > 1) q") === '0', '2.5 nenhum produto duplicado (categoria + nome)');
  check(sql('select count(*) from menu_items where is_demo') === '0', '2.6 produtos de demonstração removidos');
  check(sql(`select count(*) from menu_categories where active and id = any(array[${cat.cats.map((c) => `'${c.id}'`).join(',')}])`) === String(cat.cats.length), `2.7 as ${cat.cats.length} categorias estão ativas`);
  check(sql("select count(*) from menu_categories where active and id not in (" + cat.cats.map((c) => `'${c.id}'`).join(',') + ")") === '0', '2.8 categorias antigas vazias ficaram escondidas');
  check(sql("select string_agg(id, ',' order by position) from menu_categories where active") === cat.cats.map((c) => c.id).join(','), '2.9 ordem das categorias = ordem da ementa');
  check(sql('select count(*) from menu_items where review_note is not null') === String(cat.items.filter((i) => i.review).length), `2.10 ${cat.items.filter((i) => i.review).length} produtos marcados "a confirmar"`);
  check(Number(sql('select count(*) from menu_items where price <= 0')) === 0, '2.11 nenhum preço inválido');

  // ---------- 3. idempotência: não duplica, não sobrescreve preços editados ----------
  sql("update menu_items set price = 2500 where name = 'Moelas'");
  sql("delete from menu_items where name = 'Chouriço'");
  await ap.reload({ waitUntil: 'networkidle' });
  check(await ap.locator('[data-testid="import-panel"]').isVisible(), '3.1 com um produto em falta, o painel volta a oferecer a importação');
  ap.once('dialog', (d) => d.accept()); await ap.getByRole('button', { name: 'Importar ementa original' }).click();
  await ap.waitForSelector('text=1 produtos novos', { timeout: 30000 }); check(true, '3.2 segunda importação cria só o que falta (1 novo)');
  check(sql("select price from menu_items where name='Moelas'") === '2500', '3.3 preço editado pelo gerente NÃO é sobrescrito pela importação');
  check(sql('select count(*) from menu_items') === String(cat.items.length), '3.4 continua sem duplicados após reimportar');
  sql("update menu_items set price = 2000 where name = 'Moelas'");

  // ---------- 4. menu do cliente mostra tudo ----------
  const tok = sql('select qr_token from dining_tables where number = 1');
  const iph = await b.newContext(devices['iPhone 13']); const c = await iph.newPage();
  c.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/net::ERR/.test(m.text())) errs.push(`cliente: ${m.text().slice(0, 150)}`); });
  await c.goto(`${B}/m/${tok}`, { waitUntil: 'networkidle' });
  const shown = await c.locator('section[id^="cat-"]').evaluateAll((secs) => secs.map((s) => ({ label: s.querySelector('h2').innerText, items: [...s.querySelectorAll('li')].map((li) => ({ name: li.querySelector('h3').innerText, text: li.innerText })) })));
  const total = shown.reduce((n, s) => n + s.items.length, 0);
  check(total === cat.items.length, `4.1 menu do cliente mostra ${total} de ${cat.items.length} produtos`);
  check(shown.length === cat.cats.length, `4.2 mostra as ${shown.length} categorias`);
  check(JSON.stringify(shown.map((s) => s.label)) === JSON.stringify(cat.cats.map((x) => x.label)), '4.3 ordem e nomes das categorias iguais à ementa');
  const flat = new Map(shown.flatMap((s, i) => s.items.map((x) => [`${cat.cats[i].id}|${x.name}`, x.text])));
  let badPrice = [], notShown = [];
  for (const it of cat.items) { const t = flat.get(`${it.cat}|${it.name}`); if (!t) { notShown.push(it.name); continue; } if (!t.replace(/\s/g, ' ').includes(`${brl(it.price)} FCFA`)) badPrice.push(`${it.name} (${brl(it.price)})`); }
  check(notShown.length === 0, `4.4 cada produto aparece no menu do cliente (em falta: ${notShown.join(', ') || 'nenhum'})`);
  check(badPrice.length === 0, `4.5 o preço mostrado ao cliente = preço da ementa (${badPrice.length} diferenças${badPrice.length ? ': ' + badPrice.slice(0, 4).join('; ') : ''})`);
  check(!(await c.locator('text=Demonstração').count()), '4.6 sem selos nem produtos de demonstração');
  check(!(await c.locator('text=A confirmar').count()), '4.7 notas internas "a confirmar" não aparecem ao cliente');
  check((await c.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '4.8 sem scroll horizontal no iPhone');
  await c.screenshot({ path: `${OUT}/cliente-iphone.png` });
  await c.evaluate(() => document.getElementById('cat-whiskies').scrollIntoView()); await sleep(300); await c.screenshot({ path: `${OUT}/cliente-whiskies-iphone.png` });
  const pc = await b.newContext({ viewport: { width: 1280, height: 900 } }); const d = await pc.newPage(); await d.goto(`${B}/m/${tok}`, { waitUntil: 'networkidle' });
  check((await d.locator('section[id^="cat-"] li').count()) === cat.items.length, '4.9 computador: todos os produtos visíveis');

  // ---------- 5. pedido real com produtos da ementa ----------
  await c.goto(`${B}/m/${tok}`, { waitUntil: 'networkidle' });
  await c.getByRole('button', { name: 'Adicionar Pizza de Frango (Média)' }).click(); await c.getByRole('button', { name: 'Mais Pizza de Frango (Média)' }).click();
  await c.getByRole('button', { name: 'Adicionar Jack Daniel\'s (Garrafa)' }).click();
  await c.getByRole('button', { name: /Ver pedido/ }).click();
  check(await c.locator('text=50 000 FCFA').first().isVisible(), '5.1 total do carrinho: 2×5 000 + 40 000 = 50 000 FCFA');
  await c.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(); await c.waitForURL(/\/pedido\//);
  const oid = (c.url().match(/\/pedido\/([0-9a-f-]{36})/) || [])[1]; // o pedido que ESTE teste acabou de criar
  const row = sql(`select o.total||'|'||o.is_test from orders o where o.id = '${oid}'`);
  check(row === '50000|false', `5.2 pedido real gravado: total e "não é teste" (${row})`);

  // ---------- 6. permissões ----------
  const g = await b.newContext({ viewport: { width: 1280, height: 900 } }); const gp = await login(g, G1, G1PASS);
  await gp.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  check((await gp.locator('[data-testid="import-panel"]').count()) === 0, '6.1 Gerente não vê o painel de importação');
  check(await gp.locator('[data-testid="review-list"]').isVisible(), '6.2 Gerente vê a lista "a confirmar"');
  // repetir a ação de importar (capturada do Admin) com a sessão do Gerente
  sql("delete from menu_items where name = 'Café'");
  let cap = null; ap.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) cap = { url: r.url(), headers: r.headers(), body: r.postData() }; });
  await ap.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  sql("update menu_items set name = 'Café' where false");
  ap.once('dialog', (d2) => d2.accept()); await ap.getByRole('button', { name: 'Importar ementa original' }).click(); await ap.waitForSelector('text=1 produtos novos'); // volta a criar "Café"
  sql("delete from menu_items where name = 'Café'");
  const r = await g.request.post(cap.url, { headers: { 'content-type': cap.headers['content-type'], 'next-action': cap.headers['next-action'], accept: 'text/x-component' }, data: cap.body });
  check(sql("select count(*) from menu_items where name = 'Café'") === '0', `6.3 Gerente NÃO consegue importar (ação repetida no servidor, HTTP ${r.status()})`);
  // revisão: editar limpa a nota
  sql("insert into menu_items (category_id,name,description,price,position) select 'cafe-cha','Café',' ',500,99 where not exists (select 1 from menu_items where name='Café')");
  await ap.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  const li = ap.locator('li', { hasText: 'Hamburguer Simples' }).filter({ has: ap.locator('[data-testid="review-note"]') }).first(); check(await li.locator('[data-testid="review-note"]').isVisible(), '6.4 produto com nota mostra "A confirmar"');
  await li.getByRole('button', { name: 'Editar' }).click(); await li.getByRole('button', { name: 'Guardar alterações' }).click(); await sleep(2000);
  check(sql("select review_note is null from menu_items where name='Hamburguer Simples'") === 't', '6.5 ao guardar, a nota "a confirmar" desaparece');
  await ap.screenshot({ path: `${OUT}/admin-menu.png` });

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.map((x) => '  ✓ ' + x).join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.map((x) => '  ✗ ' + x).join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + [...new Set(errs)].map((x) => '  ! ' + x).join('\n'));
})().catch((e) => { console.error('FATAL', e.stack.split('\n').slice(0, 7).join('\n')); console.log('ok até agora:', ok.length, 'falhas:', bad); process.exit(1); });
