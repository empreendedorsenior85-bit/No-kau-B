/* E2E do sistema de pedidos por QR Code — fluxo completo com dados reais na base local. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const S = __dirname;
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

const B = 'http://localhost:3100';
const EMAIL = 'gerente@nokau.test';
const PASS = 'senha-forte-123';
const OUT = require('node:path').join(OUTDIR, 'shots', 'qr');
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();

const sqlSafe = (q) => { try { return sql(q); } catch { return '0'; } };
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errorsOf = (page, tag) => {
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(401|404|503)|net::ERR/.test(m.text())) errs.push(`${tag}: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message.slice(0, 160)}`));
};

async function login(ctx) {
  const p = await ctx.newPage();
  await p.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', EMAIL);
  await p.fill('input[name=password]', PASS);
  await p.click('button[type=submit]');
  await p.waitForURL('**/admin/dashboard');
  await p.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' });
  return p;
}

async function addToCart(p, names) {
  for (const [name, n] of names) {
    await p.getByRole('button', { name: `Adicionar ${name}` }).click();
    for (let i = 1; i < n; i++) await p.getByRole('button', { name: `Mais ${name}` }).click();
  }
}

(async () => {
  // base limpa
  for (let i = 0; i < 8; i++) {
    try {
      execSync(`psql -h localhost -p 5433 -U postgres -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='nokau_test'" -c "drop database if exists nokau_test" -c "create database nokau_test"`, { stdio: 'ignore' });
      break;
    } catch (e) { if (i === 7) throw e; await sleep(700); }
  }
  // Etapa C: para pedir é preciso conta — todos os contextos destes testes são de um cliente com sessão iniciada
  const b = require('./auth-helper.js').clientContexts(await chromium.launch());

  // ---------- 1. Primeiro acesso, login, segurança de acesso ----------
  const mctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const mp = await mctx.newPage(); errorsOf(mp, 'gerente');
  await mp.goto(B + '/admin/pedidos'); await mp.waitForURL('**/admin/setup');
  check(true, '1.1 /admin/pedidos sem sessão redireciona para o primeiro acesso (sem gerente) ');
  await mp.fill('input[name=token]', 'codigo-errado'); await mp.fill('input[name=email]', EMAIL); await mp.fill('input[name=password]', PASS);
  await mp.click('button[type=submit]'); await mp.waitForSelector('text=Código de configuração incorreto');
  check(sqlSafe('select count(*) from admin_users') === '0', '1.2 código de configuração errado não cria gerente');
  await mp.fill('input[name=token]', 'setup-test-123'); await mp.fill('input[name=password]', 'curta');
  await mp.click('button[type=submit]'); await sleep(600);
  check(sqlSafe('select count(*) from admin_users') === '0', '1.3 palavra-passe curta recusada');
  await mp.fill('input[name=password]', PASS); await mp.click('button[type=submit]');
  await mp.waitForURL('**/admin/dashboard');
  check(sql('select count(*) from dining_tables') === '10', '1.4 setup criou 10 mesas');
  check(sql('select count(*) from admin_users') === '1', '1.5 setup criou 1 gerente');
  check(!sql('select password_hash from admin_users').includes(PASS) && sql('select password_hash from admin_users').startsWith('scrypt$'), '1.6 palavra-passe guardada com hash (scrypt)');
  check(sql("select count(*) from pg_class where relname in ('orders','order_items','dining_tables') and relrowsecurity") === '3', '1.7 RLS ativo nas tabelas');

  const anon = await b.newContext(); const ap = await anon.newPage();
  for (const path of ['/admin/pedidos', '/admin/mesas', '/admin/qr', '/admin/menu', '/admin/qr/imprimir']) {
    await ap.goto(B + path); await ap.waitForURL(/\/admin\/login/);
    check(/\/admin\/login/.test(ap.url()), `1.8 ${path} sem sessão -> login`);
  }
  for (const [path] of [['/api/admin/orders'], ['/api/admin/stream'], ['/admin/qr-img/1']]) {
    const r = await anon.request.get(B + path); check(r.status() === 401, `1.9 ${path} sem sessão -> 401 (${r.status()})`);
  }
  await ap.goto(B + '/admin/setup'); await ap.waitForURL(/\/admin\/login/); check(true, '1.10 /admin/setup fechado depois do primeiro gerente');
  await ap.fill('input[name=email]', EMAIL); await ap.fill('input[name=password]', 'errada-123456'); await ap.click('button[type=submit]');
  await ap.waitForSelector('text=incorretos'); check(true, '1.11 login com palavra-passe errada recusado');
  // cookie forjado
  await anon.addCookies([{ name: 'nk_session', value: 'abc.9999999999999.forjado', url: B }]);
  const fr = await anon.request.get(B + '/api/admin/orders'); check(fr.status() === 401, '1.12 cookie de sessão forjado -> 401');
  await anon.close();

  // ---------- 2. Menu (gerente) ----------
  await mp.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  await mp.getByRole('button', { name: 'Carregar produtos de demonstração' }).click();
  await mp.waitForSelector('text=Demonstração · Entrada A');
  check(sql('select count(*) from menu_items where is_demo') === '6', '2.1 produtos de demonstração criados e marcados');
  // produto real com preço
  await mp.fill('form:has(button:has-text("Adicionar produto")) >> input[name=name]', 'Peixe de teste real');
  await mp.fill('form:has(button:has-text("Adicionar produto")) >> input[name=price]', '6500');
  await mp.selectOption('form:has(button:has-text("Adicionar produto")) >> select[name=categoryId]', 'principais');
  await mp.click('text=Adicionar produto'); await mp.waitForSelector('text=Peixe de teste real');
  check(sql("select price from menu_items where name='Peixe de teste real'") === '6500', '2.2 produto com preço criado pelo gerente');

  // ---------- 3. QR Codes ----------
  await mp.goto(B + '/admin/qr', { waitUntil: 'networkidle' });
  const urls = [];
  for (let n = 1; n <= 10; n++) urls.push(await mp.locator(`[data-testid="qr-url-${n}"]`).innerText());
  check(new Set(urls).size === 10, '3.1 10 mesas com 10 links distintos');
  check(urls.every((u) => /\/m\/[A-Za-z0-9_-]{22}$/.test(u)), '3.2 todos os links têm token de 22 caracteres (128 bits)');
  check(urls.every((u) => !/\/m\/\d+$/.test(u)), '3.3 links não contêm o número da mesa (não adivinháveis)');
  // descarregar PNG e descodificar como um telemóvel
  const decoded = {};
  for (const n of [1, 2, 3, 10]) {
    const id = sql(`select id from dining_tables where number=${n}`);
    const r = await mctx.request.get(`${B}/admin/qr-img/${id}?format=png&download=1`);
    const png = PNG.sync.read(Buffer.from(await r.body()));
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    decoded[n] = code?.data;
    check(r.headers()['content-type'] === 'image/png' && /attachment/.test(r.headers()['content-disposition']), `3.4 mesa ${n}: PNG descarregável`);
    check(decoded[n] === urls[n - 1], `3.5 mesa ${n}: QR descodificado = link da mesa (${decoded[n]?.slice(-8)})`);
  }
  const svg = await mctx.request.get(`${B}/admin/qr-img/1?format=svg`); check(/<svg/.test(await svg.text()), '3.6 SVG disponível');
  await mp.goto(B + '/admin/qr/imprimir', { waitUntil: 'networkidle' });
  check((await mp.locator('section[class*="break-inside-avoid"]').count()) === 10, '3.7 folha de impressão com 10 fichas');
  await mp.screenshot({ path: `${OUT}/admin-imprimir.png` });
  await mp.goto(B + '/admin/qr', { waitUntil: 'networkidle' }); await mp.screenshot({ path: `${OUT}/admin-qr.png`, fullPage: false });

  // ---------- 4. Painel aberto ANTES do pedido (tempo real) ----------
  await mp.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' });
  await mp.waitForSelector('text=Ao vivo');
  await mp.evaluate(() => { window.__marker = 'sem-reload'; });
  await mp.getByRole('button', { name: /Ativar alertas/ }).click();
  check(await mp.isVisible('text=Alertas ativos'), '4.1 alertas ativados (gesto do utilizador)');
  const m2ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const m2 = await login(m2ctx); errorsOf(m2, 'gerente2'); await m2.waitForSelector('text=Ao vivo');

  // ---------- 5. Cliente da mesa 1 ----------
  const cctx = await b.newContext(devices['iPhone 13']);
  const c1 = await cctx.newPage(); errorsOf(c1, 'cliente1');
  await c1.goto(decoded[1], { waitUntil: 'networkidle' });
  check(await c1.getByText('Mesa 1', { exact: true }).first().isVisible(), '5.1 QR da mesa 1 abre o menu da Mesa 1 (sem escolher mesa)');
  check(await c1.locator('text=Peixe de teste real').first().isVisible(), '5.2 menu mostra produtos e categorias');
  check(await c1.locator('text=6 500 FCFA').first().isVisible(), '5.3 preço em FCFA');
  await c1.screenshot({ path: `${OUT}/cliente-menu-iphone.png` });
  await addToCart(c1, [['Peixe de teste real', 2], ['Demonstração · Bebida A', 1]]);
  await c1.getByRole('button', { name: /Ver pedido/ }).click();
  const inputs = c1.locator('input[placeholder^="Observação"]');
  await inputs.nth(0).fill('sem picante, bem passado');
  await inputs.nth(1).fill('com gelo');
  check(await c1.locator('text=14 000 FCFA').first().isVisible(), '5.4 total no carrinho 2×6500 + 1×1000 = 14 000 FCFA');
  await c1.screenshot({ path: `${OUT}/cliente-carrinho-iphone.png` });
  // remover/alterar: alterar quantidade e voltar
  await c1.getByRole('dialog').getByRole('button', { name: 'Menos Peixe de teste real' }).click();
  check(await c1.locator('text=7 500 FCFA').first().isVisible(), '5.5 alterar quantidade atualiza o total');
  await c1.getByRole('dialog').getByRole('button', { name: 'Mais Peixe de teste real' }).click();
  // recarregar a página: carrinho persiste (rede instável)
  await c1.reload({ waitUntil: 'networkidle' }); await c1.getByRole('button', { name: /Ver pedido/ }).click();
  check((await c1.locator('input[placeholder^="Observação"]').first().inputValue()) === 'sem picante, bem passado', '5.6 carrinho e observações sobrevivem a recarregar');

  // enviar com duplo clique (proteção de duplicados)
  const confirm = c1.getByRole('button', { name: /Confirmar e enviar pedido/ });
  await confirm.dblclick();
  await c1.waitForURL(/\/pedido\//, { timeout: 15000 });
  await sleep(500);
  check(sql("select count(*) from orders o join dining_tables t on t.id=o.table_id where t.number=1") === '1', '5.7 duplo clique criou UM só pedido');
  const num = Number(sql('select number from orders limit 1'));
  const orderUrl = c1.url();
  check(await c1.locator(`text=#${String(num).padStart(4, '0')}`).first().isVisible(), '5.8 confirmação mostra o número do pedido');
  check(await c1.locator('h1 ~ p:has-text("Mesa 1")').first().isVisible(), '5.9 confirmação mostra a mesa');
  check(await c1.locator('text=Recebido pelo restaurante').isVisible() && await c1.locator('text=14 000 FCFA').first().isVisible(), '5.10 confirmação: estado, resumo e total');
  check(await c1.locator('text=“sem picante, bem passado”').isVisible(), '5.11 observações aparecem no resumo');
  await c1.screenshot({ path: `${OUT}/cliente-confirmacao-iphone.png`, fullPage: true });
  const row = sql("select total||'|'||status||'|'||is_test from orders limit 1"); check(row === '14000|pending|true', `5.12 base de dados: total 14000, pendente, marcado teste (${row})`);
  check(sql('select count(*) from order_items') === '2', '5.13 itens guardados com nome, preço e observação');
  check(sql("select count(*) from order_items where note='com gelo' and unit_price=1000 and quantity=1") === '1', '5.14 observação e preço unitário do momento guardados');

  // ---------- 6. Painel recebeu em tempo real ----------
  await mp.waitForSelector(`[data-testid="order-${num}"]`, { timeout: 8000 });
  const card = mp.locator(`[data-testid="order-${num}"]`);
  const txt = await card.innerText();
  check(/Mesa 1/.test(txt) && /2×/.test(txt) && /Peixe de teste real/.test(txt) && /sem picante, bem passado/.test(txt) && /14\s?000 FCFA/.test(txt) && /Teste/i.test(txt), '6.1 notificação mostra nº, mesa, produtos, quantidades, observações, total e etiqueta de teste');
  check(await mp.evaluate(() => window.__marker) === 'sem-reload', '6.2 chegou SEM recarregar a página');
  check(await mp.title().then((t) => /NOVO PEDIDO|Pedidos/.test(t)), '6.3 título do separador sinaliza o pedido');
  check(await mp.locator('nav[aria-label="Painel"] [data-testid="badge-pedidos"]').first().innerText().then((t) => t === '1').catch(() => false), '6.4 contador de pedidos novos no menu');
  check(await card.evaluate((el) => getComputedStyle(el).animationName.includes('nk-pulse')), '6.5 cartão pulsa até ser visto');
  await m2.waitForSelector(`[data-testid="order-${num}"]`, { timeout: 8000 }); check(true, '6.6 segundo dispositivo do gerente também recebeu');
  await mp.screenshot({ path: `${OUT}/painel-novo-pedido.png` });
  await card.click(); await sleep(300);
  check(await mp.locator('nav[aria-label="Painel"] >> text=Pedidos').locator('span').count() === 0, '6.7 tocar no cartão confirma que foi visto');

  // ---------- 7. Estados ----------
  // capturar a chamada da ação para o teste de segurança
  let captured = null;
  mp.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action'] && !captured) captured = { headers: r.headers(), body: r.postData(), url: r.url() }; });
  await card.getByRole('button', { name: 'Iniciar preparação' }).click();
  await mp.waitForSelector(`section[aria-label="Em preparação"] [data-testid="order-${num}"]`, { timeout: 8000 });
  check(sql("select status from orders limit 1") === 'preparing', '7.1 gerente: Pendente -> Em preparação (base de dados)');
  await m2.getByRole('tab', { name: /Em preparação/ }).click();
  await m2.waitForSelector(`section[aria-label="Em preparação"] [data-testid="order-${num}"]`, { timeout: 8000 }); check(true, '7.2 segundo dispositivo viu a mudança sem atualizar');
  await c1.waitForSelector('text=A cozinha começou a preparar', { timeout: 12000 }); check(true, '7.3 cliente vê "Em preparação" sozinho');
  await mp.locator(`[data-testid="order-${num}"]`).getByRole('button', { name: 'Marcar concluído' }).click();
  await mp.waitForSelector(`section[aria-label="Concluído"] [data-testid="order-${num}"]`, { timeout: 8000 });
  check(sql("select status from orders limit 1") === 'done', '7.4 gerente: -> Concluído');
  await c1.waitForSelector('text=Pedido pronto', { timeout: 12000 }); check(true, '7.5 cliente vê "Pedido pronto" sozinho');
  check(sql("select count(*) from audit_log where action='order.status'") === '2', '7.6 mudanças de estado registadas (auditoria)');
  await mp.screenshot({ path: `${OUT}/painel-concluido.png` });

  // segurança: repetir a ação do gerente SEM sessão não pode alterar nada
  if (captured) {
    sql(`update orders set status='pending' where number=${num}`);
    const res = await b.newContext(); // sem cookies
    const rr = await res.request.post(captured.url, { headers: { 'content-type': captured.headers['content-type'], 'next-action': captured.headers['next-action'], accept: captured.headers['accept'] ?? 'text/x-component' }, data: captured.body });
    check(sql(`select status from orders where number=${num}`) === 'pending', `7.7 ação de mudar estado sem sessão NÃO altera o pedido (HTTP ${rr.status()})`);
    await res.close();
  } else check(false, '7.7 (não capturou a ação)');
  sql(`update orders set status='done' where number=${num}`);

  // ---------- 8. Mesas diferentes em simultâneo ----------
  const t2 = await b.newContext(devices['Pixel 7']); const t3 = await b.newContext(devices['iPhone 13']);
  const c2 = await t2.newPage(); const c3 = await t3.newPage(); errorsOf(c2, 'cliente2'); errorsOf(c3, 'cliente3');
  await Promise.all([c2.goto(decoded[2], { waitUntil: 'networkidle' }), c3.goto(decoded[3], { waitUntil: 'networkidle' })]);
  check(await c2.getByText('Mesa 2', { exact: true }).first().isVisible() && await c3.getByText('Mesa 3', { exact: true }).first().isVisible(), '8.1 mesa 2 e 3 abrem o menu das suas mesas');
  await addToCart(c2, [['Demonstração · Prato A', 3]]); await addToCart(c3, [['Demonstração · Entrada B', 1], ['Demonstração · Prato B', 2]]);
  await c2.getByRole('button', { name: /Ver pedido/ }).click(); await c3.getByRole('button', { name: /Ver pedido/ }).click();
  await Promise.all([c2.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(), c3.getByRole('button', { name: /Confirmar e enviar pedido/ }).click()]);
  await Promise.all([c2.waitForURL(/\/pedido\//), c3.waitForURL(/\/pedido\//)]);
  const rows = sql("select t.number||':'||o.total||':'||o.status from orders o join dining_tables t on t.id=o.table_id where t.number in (2,3) order by t.number").split('\n');
  check(rows.join(',') === '2:3000:pending,3:3000:pending', `8.2 pedidos simultâneos associados às mesas certas (${rows.join(',')})`);
  const n2 = sql("select o.number from orders o join dining_tables t on t.id=o.table_id where t.number=2");
  const n3 = sql("select o.number from orders o join dining_tables t on t.id=o.table_id where t.number=3");
  await mp.waitForSelector(`[data-testid="order-${n2}"]`); await mp.waitForSelector(`[data-testid="order-${n3}"]`);
  const t2txt = await mp.locator(`[data-testid="order-${n2}"]`).innerText(); const t3txt = await mp.locator(`[data-testid="order-${n3}"]`).innerText();
  check(/Mesa 2/.test(t2txt) && /Prato A/.test(t2txt) && !/Prato B|Entrada B/.test(t2txt), '8.3 cartão da mesa 2 só tem os produtos da mesa 2');
  check(/Mesa 3/.test(t3txt) && /Prato B/.test(t3txt) && /Entrada B/.test(t3txt) && !/Prato A/.test(t3txt), '8.4 cartão da mesa 3 só tem os produtos da mesa 3');
  check(n2 !== n3 && Number(n2) > num, '8.5 números de pedido únicos e sequenciais');

  // ---------- 9. Vista por mesa ----------
  await mp.getByRole('link', { name: 'Mesas' }).click(); await mp.waitForSelector('[data-testid="table-1"]');
  check((await mp.locator('[data-testid="table-1"]').getAttribute('data-tone')) === 'done', '9.1 mesa 1: só concluídos');
  check((await mp.locator('[data-testid="table-2"]').getAttribute('data-tone')) === 'pending', '9.2 mesa 2: pendente');
  check((await mp.locator('[data-testid="table-5"]').getAttribute('data-tone')) === 'none', '9.3 mesa 5: livre');
  await mp.getByRole('button', { name: 'Com pendentes' }).click(); await sleep(200);
  check((await mp.locator('[data-testid^="table-"]').count()) === 2, '9.4 filtro "Com pendentes" mostra mesas 2 e 3');
  await mp.getByRole('button', { name: 'Todas' }).click();
  await mp.locator('[data-testid="table-1"]').click();
  check((await mp.locator('aside[aria-label="Pedidos e chamadas da mesa"] article').count()) === 1 && /Mesa 1/.test(await mp.locator('aside[aria-label="Pedidos e chamadas da mesa"]').innerText()), '9.5 histórico da mesa 1 só contém pedidos da mesa 1');
  await mp.screenshot({ path: `${OUT}/painel-mesas.png` });

  // ---------- 10. Segurança do pedido ----------
  // 10a. manipular o pedido em trânsito: quantidade absurda e produto inexistente
  const t4 = await b.newContext(devices['iPhone 13']); const c4 = await t4.newPage(); errorsOf(c4, 'cliente4');
  await c4.goto(decoded[10], { waitUntil: 'networkidle' });
  await addToCart(c4, [['Demonstração · Prato A', 1]]); await c4.getByRole('button', { name: /Ver pedido/ }).click();
  await c4.route('**/api/pedidos', async (route) => {
    const req = route.request();
    return route.continue({ postData: req.postData().replace('"quantity":1', '"quantity":999') });
  });
  await c4.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await c4.waitForSelector('text=Máximo de 20 unidades', { timeout: 8000 });
  check(sql("select count(*) from orders o join dining_tables t on t.id=o.table_id where t.number=10") === '0', '10.1 quantidade manipulada (999) recusada, nenhum pedido criado');
  await c4.unroute('**/api/pedidos');
  await c4.route('**/api/pedidos', async (route) => {
    const req = route.request();
    const itemId = sql("select id from menu_items where name='Demonstração · Prato A'");
    return route.continue({ postData: req.postData().replace(`"itemId":${itemId}`, '"itemId":99999') });
  });
  await c4.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await c4.waitForSelector('text=já não estão disponíveis', { timeout: 8000 });
  check(sql("select count(*) from orders o join dining_tables t on t.id=o.table_id where t.number=10") === '0', '10.2 produto inexistente recusado');
  await c4.unroute('**/api/pedidos');
  // 10b. preço manipulado: injetar campo price no pedido — o servidor ignora
  await c4.route('**/api/pedidos', async (route) => {
    const req = route.request();
    return route.continue({ postData: req.postData().replace('"quantity":1', '"quantity":1,"price":1,"total":1') });
  });
  await c4.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await c4.waitForURL(/\/pedido\//, { timeout: 10000 });
  check(sql("select o.total||'|'||i.unit_price from orders o join order_items i on i.order_id=o.id join dining_tables t on t.id=o.table_id where t.number=10") === '1000|1000', '10.3 campos "price"/"total" injetados são ignorados: preço vem da base de dados');
  await c4.unroute('**/api/pedidos');
  // 10c. produto indisponível
  await mp.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  const li = mp.locator('li', { hasText: 'Demonstração · Bebida B' });
  await li.getByLabel('Disponível').uncheck(); await sleep(700);
  check(sql("select available from menu_items where name='Demonstração · Bebida B'") === 'f', '10.4 gerente marcou produto indisponível');
  await c1.goto(decoded[1], { waitUntil: 'networkidle' });
  check(await c1.locator('li:has-text("Demonstração · Bebida B") >> text=Indisponível >> visible=true').isVisible(), '10.5 cliente vê "Indisponível" e não pode pedir');
  check(await c1.getByRole('button', { name: 'Adicionar Demonstração · Bebida B' }).count() === 0, '10.6 botão de adicionar não existe para indisponível');
  // 10d. token inválido e rotação
  await c1.goto(B + '/m/AAAAAAAAAAAAAAAAAAAAAA', { waitUntil: 'networkidle' });
  check(await c1.locator('text=QR Code inválido').isVisible(), '10.7 token inventado -> "QR Code inválido"');
  await c1.goto(B + '/m/1', { waitUntil: 'networkidle' }); check(await c1.locator('text=QR Code inválido').isVisible(), '10.8 /m/1 (número de mesa) não funciona');
  // pedido de outro token/mesa não é visível
  const oid = orderUrl.split('/pedido/')[1];
  await c1.goto(`${B}/m/${decoded[2].split('/m/')[1]}/pedido/${oid}`, { waitUntil: 'networkidle' });
  check(await c1.locator('text=QR Code inválido').isVisible(), '10.9 pedido da mesa 1 não abre com o token da mesa 2');
  const pr = await cctx.request.get(`${B}/api/pedidos/${oid}?t=${decoded[2].split('/m/')[1]}`); check(pr.status() === 404, `10.10 API pública: pedido com token de outra mesa -> 404`);
  const pr2 = await cctx.request.get(`${B}/api/pedidos/${oid}`); check(pr2.status() === 404, '10.11 API pública sem token -> 404');
  const pr3 = await cctx.request.get(`${B}/api/pedidos/${oid}?t=${decoded[1].split('/m/')[1]}`); const pj = await pr3.json();
  check(pr3.status() === 200 && !('id' in pj) && !('tableId' in pj) && pj.number === num, '10.12 API pública devolve só dados mínimos do pedido');
  check((await cctx.request.fetch(`${B}/api/pedidos/${oid}?t=${decoded[1].split('/m/')[1]}`, { method: 'POST' })).status() === 405, '10.13 cliente não pode alterar pedido pela API (POST -> 405)');
  check((await cctx.request.fetch(`${B}/api/pedidos/${oid}?t=${decoded[1].split('/m/')[1]}`, { method: 'PATCH', data: '{"status":"done"}' })).status() === 405, '10.14 PATCH -> 405');
  // rotação de token pelo gerente
  await mp.goto(B + '/admin/qr', { waitUntil: 'networkidle' });
  mp.once('dialog', (d) => d.accept());
  await mp.locator('[data-testid="qr-3"]').getByRole('button', { name: 'Gerar novo QR' }).click(); await sleep(1500);
  const newUrl3 = await mp.locator('[data-testid="qr-url-3"]').innerText();
  check(newUrl3 !== decoded[3], '10.15 gerar novo QR muda o link da mesa 3');
  await c3.goto(decoded[3], { waitUntil: 'networkidle' }); check(await c3.locator('text=QR Code inválido').isVisible(), '10.16 QR antigo da mesa 3 deixou de funcionar');
  await c3.goto(newUrl3, { waitUntil: 'networkidle' }); check(await c3.getByText('Mesa 3', { exact: true }).first().isVisible(), '10.17 novo QR da mesa 3 funciona');
  check(sql(`select count(*) from orders o join dining_tables t on t.id=o.table_id where t.number=3`) === '1', '10.18 pedido antigo continua associado à mesa 3 depois de rodar o token');
  // limite por mesa
  sql("insert into orders (table_id,total,idempotency_key) select id,0,'limite-teste-'||g||'-xxxxxxxx' from dining_tables, generate_series(1,20) g where number=5");
  const t5 = await b.newContext(devices['iPhone 13']); const c5 = await t5.newPage();
  const tok5 = sql('select qr_token from dining_tables where number=5');
  await c5.goto(`${B}/m/${tok5}`, { waitUntil: 'networkidle' }); await addToCart(c5, [['Demonstração · Prato A', 1]]);
  await c5.getByRole('button', { name: /Ver pedido/ }).click(); await c5.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await c5.waitForSelector('text=Demasiados pedidos desta mesa', { timeout: 8000 }); check(true, '10.19 limite de pedidos por mesa (anti-abuso)');
  sql("delete from orders where idempotency_key like 'limite-teste-%'");

  // ---------- 11. Falha de ligação e recuperação ----------
  const place = async (prod) => {
    await c2.goto(decoded[2], { waitUntil: 'networkidle' });
    await c2.getByRole('button', { name: `Adicionar ${prod}` }).click(); await c2.getByRole('button', { name: /Ver pedido/ }).click();
    await c2.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(); await c2.waitForURL(/\/pedido\//);
  };
  // 11A: canal em tempo real BLOQUEADO (proxy/rede móvel): o plano B recebe os pedidos na mesma
  const dctx0 = await b.newContext({ viewport: { width: 1280, height: 800 } }); const dp0 = await dctx0.newPage();
  await dctx0.route('**/api/admin/stream*', (r) => r.abort());
  await login(dctx0).then(() => {}); const mpB = (await dctx0.pages()).slice(-1)[0];
  await mpB.waitForSelector('text=A reconectar', { timeout: 15000 }); check(true, '11.1 canal bloqueado: painel mostra "A reconectar…"');
  await mpB.waitForSelector('article[data-testid^="order-"]');
  const nB = await mpB.locator('article[data-testid^="order-"]').count();
  await place('Demonstração · Entrada A');
  await mpB.waitForFunction((n) => document.querySelectorAll('article[data-testid^="order-"]').length > n, nB, { timeout: 15000 });
  check(true, '11.2 mesmo com o canal bloqueado, o pedido novo chegou (consulta de reserva, <15 s)');
  // 11B: falha TOTAL (nem canal nem consulta): nada chega; ao voltar, tudo é recuperado
  await mpB.route('**/api/admin/orders', (r) => r.abort());
  const nB2 = await mpB.locator('article[data-testid^="order-"]').count();
  await place('Demonstração · Prato B'); await place('Demonstração · Entrada A');
  await sleep(7000);
  check((await mpB.locator('article[data-testid^="order-"]').count()) === nB2, '11.3 falha total: painel não recebe (esperado) e mostra aviso');
  check(await mpB.locator('[role=alert]:has-text("recuperados")').isVisible(), '11.4 aviso de recuperação visível');
  await mpB.unroute('**/api/admin/orders');
  await mpB.waitForFunction((n) => document.querySelectorAll('article[data-testid^="order-"]').length >= n + 2, nB2, { timeout: 15000 });
  check(true, '11.5 ao voltar a ligação, os 2 pedidos em falta foram recuperados (sem recarregar)');
  check(await mpB.locator('nav[aria-label="Painel"] [data-testid="badge-pedidos"]').first().innerText().then((t) => Number(t) >= 2).catch(() => false), '11.6 pedidos recuperados aparecem como NOVOS (não passam despercebidos)');
  await dctx0.unroute('**/api/admin/stream*').catch(() => {});
  await mpB.waitForSelector('text=Ao vivo', { timeout: 20000 }); check(true, '11.7 canal em tempo real religou-se sozinho ("Ao vivo")');
  await dctx0.close();
  // 11C: desligar a rede do navegador (evento offline)
  await mp.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' }); await mp.waitForSelector('text=Ao vivo');
  await mctx.setOffline(true); await mp.waitForSelector('text=Sem rede', { timeout: 8000 }); check(true, '11.8 rede desligada: painel mostra "Sem rede"');
  await mctx.setOffline(false); await mp.waitForSelector('text=Ao vivo', { timeout: 20000 }); check(true, '11.9 rede de volta: painel volta a "Ao vivo"');
  // cliente sem rede: carrinho guardado, reenvio sem duplicar
  const before2 = Number(sql('select count(*) from orders'));
  await c2.goto(decoded[2], { waitUntil: 'networkidle' });
  await c2.getByRole('button', { name: 'Adicionar Demonstração · Bebida A' }).click(); await c2.getByRole('button', { name: /Ver pedido/ }).click();
  await t2.setOffline(true);
  await c2.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  // Etapa 2: sem rede o pedido fica guardado no telemóvel e é enviado sozinho quando a rede volta
  await c2.waitForSelector('[data-testid="outbox-item"][data-state="queued"]', { timeout: 20000 }); check(true, '11.7b cliente offline: pedido guardado no telemóvel, estado visível');
  check(Number(sql('select count(*) from orders')) === before2, '11.7c sem rede nada chegou ao servidor');
  await t2.setOffline(false);
  await c2.waitForSelector('[data-testid="outbox-item"][data-state="sent"]', { timeout: 25000 });
  await new Promise((r) => setTimeout(r, 1500));
  check(Number(sql('select count(*) from orders')) === before2 + 1, '11.10 após reconectar, o envio automático criou exatamente UM pedido');

  // ---------- 12. Dispositivos: capturas ----------
  const dctx = await b.newContext(devices['Pixel 7']); const dm = await login(dctx);
  await dm.waitForSelector('article[data-testid^="order-"]'); await dm.screenshot({ path: `${OUT}/painel-android.png` });
  const ov = await dm.evaluate(() => document.documentElement.scrollWidth - innerWidth); check(ov <= 0, `12.1 painel em Android sem scroll horizontal (${ov})`);
  const ov2 = await c1.evaluate(() => document.documentElement.scrollWidth - innerWidth); check(ov2 <= 0, '12.2 menu do cliente (iPhone) sem scroll horizontal');
  await mp.screenshot({ path: `${OUT}/painel-desktop.png` });

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.map((x) => '  ✓ ' + x).join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.map((x) => '  ✗ ' + x).join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + [...new Set(errs)].map((x) => '  ! ' + x).join('\n'));
})().catch((e) => { console.error('FATAL', e.stack.split('\n').slice(0, 6).join('\n')); console.log('ok até agora:', ok.length, 'falhas:', bad); process.exit(1); });
