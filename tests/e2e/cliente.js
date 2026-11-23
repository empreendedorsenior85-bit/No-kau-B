/* Área do Cliente: cada opção do menu abre a sua página com a informação certa, sem páginas vazias, erros ou recarregar.
   Conta NOVA criada pelo formulário real; dados reais (pedido à mesa, pagamento confirmado pelo gerente, reservas). */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process'); const crypto = require('node:crypto');
const S = __dirname;
const C = 'http://localhost:3100';
const cq = (s) => execSync('psql -h localhost -p 5433 -U postgres -d nokau_test -tA -q -v ON_ERROR_STOP=1', { input: s }).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ready = async (pg) => { await pg.locator('main:visible h1').waitFor({ timeout: 20000 }); await pg.waitForFunction(() => !document.querySelector('main:not([hidden]) [hidden][id^="S:"]'), null, { timeout: 5000 }).catch(() => {}); await sleep(600); };
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; }
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };
const RUN = Date.now().toString().slice(-7);
const EMAIL = `cliente${RUN}@exemplo.test`, PHONE = `95${RUN}`, PASS = 'cliente-pass-1';
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const NAV = [['resumo', '/cliente', 'Olá, Aminata'], ['reservas', '/cliente/reservas', 'As minhas reservas'], ['pagamentos', '/cliente/pagamentos', 'Pagamentos e recibos'], ['pedidos', '/cliente/pedidos', 'Os meus pedidos']];

(async () => {
  execSync(`${S}/servers.sh central`, { stdio: 'pipe' });
  cq('delete from auth_throttle');
  cq("delete from admin_users where email = 'cli.gerente@nokau.test'");
  cq(`insert into admin_users (email, password_hash, role, name) values ('cli.gerente@nokau.test', '${hashPw('cli-gerente-1')}', 'gerente', 'Gerente Cli')`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('cliente: ' + e.message.slice(0, 150)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text().slice(0, 150)); });

  // ---------- 0. conta nova pelo formulário real ----------
  await p.goto(C + '/cliente/registo', { waitUntil: 'load' });
  await p.fill('input[name=name]', 'Aminata Baldé'); await p.fill('input[name=email]', EMAIL); await p.fill('input[name=phone]', PHONE);
  await p.fill('input[name=password]', PASS); await p.fill('input[name=password2]', PASS);
  await p.locator('input[type=checkbox]').check();
  await p.getByRole('button', { name: /Criar conta/ }).click();
  check(await p.waitForURL(/\/cliente$/, { timeout: 20000 }).then(() => true, () => false), '0.1 conta criada pelo registo → entra na área do cliente');
  const cid = cq(`select id from customers where email = '${EMAIL}'`);

  // ---------- 1. conta vazia: cada página tem conteúdo útil (nunca em branco) ----------
  for (const [id, path, h1] of NAV) {
    await p.locator(`[data-testid="client-sidebar"]:visible [data-testid="cnav-${id}"]`).click();
    await p.waitForURL(new RegExp(`${path.replace(/\//g, '\\/')}$`), { timeout: 15000 });
    await p.waitForSelector('main:visible h1');
    const t = await p.locator('main:visible').innerText();
    const cur = await p.locator('[data-testid="client-sidebar"]:visible [aria-current="page"]').allInnerTexts();
    check(cur.length === 1, `1.${id} só uma opção destacada no menu (${cur.map((x) => x.trim()).join(', ')})`);
    check((await p.locator('main:visible h1').innerText()).startsWith(h1) && t.length > 120 && (await p.locator(`[data-testid="client-sidebar"]:visible [data-testid="cnav-${id}"]`).getAttribute('aria-current')) === 'page',
      `1.${id} conta vazia: "${h1}" abre a página certa, com explicação e a opção destacada no menu`);
  }

  // ---------- 2. dados reais: pedido à mesa, pagamento, reservas ----------
  const T = Number(cq("select number from dining_tables t where active order by (select count(*) from orders o where o.table_id = t.id and o.created_at > now() - interval '10 minutes'), number limit 1"));
  const tok = cq(`select qr_token from dining_tables where number = ${T}`);
  const item = Number(cq("select id from menu_items where name = 'Frango Churrasco' and active limit 1"));
  cq(`update menu_items set available = true where id = ${item}`);
  // pedido feito na mesa com a sessão deste cliente (cookie do navegador)
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const mk = async (n) => (await (await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ token: tok, key: `cli${RUN}${n}${Date.now().toString(36)}`, lines: [{ itemId: item, quantity: 1 }] }) })).json());
  const o1 = await mk(1), o2 = await mk(2);
  check(cq(`select count(*) from orders where customer_id = '${cid}'`) === '2', '2.1 dois pedidos reais feitos à mesa com a conta');
  // gerente confirma o pagamento de um pedido (no painel)
  const g = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await g.goto(C + '/admin/login'); await g.fill('input[name=email]', 'cli.gerente@nokau.test'); await g.fill('input[name=password]', 'cli-gerente-1'); await g.click('button[type=submit]');
  await g.waitForURL(/\/admin\/dashboard/);
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  const oc = g.locator(`[data-testid="order-${o1.number}"]`);

  // o cliente está na página Pagamentos: o pagamento aparece SEM recarregar
  await p.goto(C + '/cliente/pagamentos', { waitUntil: 'load' });
  check(await p.locator('[data-testid="client-payment"]:visible').count() === 0, '2.2 Pagamentos: ainda nenhum');
  await oc.locator('[data-testid="order-pay-open"]').click();
  await oc.locator('[data-testid="order-pay"] label', { hasText: 'Orange Money' }).click();
  await oc.locator('[data-testid="order-pay-confirm"]').click();
  await waitFor(() => oc.locator('[data-testid="order-paid"]').isVisible());
  await p.evaluate(() => window.dispatchEvent(new Event('focus'))); // o cliente volta à app
  check(await waitFor(() => p.locator('[data-testid="client-payment"]:visible').count().then((n) => n === 1), 25000), '2.3 pagamento confirmado pelo gerente aparece na página do cliente sem recarregar');
  check(/Orange Money/.test(await p.locator('[data-testid="client-payment"]:visible').innerText()) && /Total pago/.test(await p.locator('[data-testid="payments-total-client"]:visible').innerText()), '2.4 Pagamentos: valor, método, recibo e total pago');
  await p.locator('[data-testid="client-payment"]:visible').click();
  await p.waitForURL(/\/cliente\/recibos\//);
  check(await waitFor(() => p.locator('[data-testid="receipt-print"]').isVisible()) && (await p.locator('[data-testid="client-sidebar"]:visible [data-testid="cnav-pagamentos"]').getAttribute('aria-current')) === 'page',
    '2.5 recibo abre dentro da área do cliente, com o menu e "Pagamentos e recibos" destacado');
  await p.locator('[data-testid="receipt-back"]:visible').click();
  check(await p.waitForURL(/\/cliente\/pagamentos$/).then(() => true, () => false), '2.6 "← Pagamentos e recibos" volta à lista');

  // reserva feita COM sessão → fica na conta
  await p.goto(C + '/reservas', { waitUntil: 'load' });
  const f = p.locator('form').filter({ has: p.locator('input[name=guests]') });
  await f.locator('input[name=name]').fill('Aminata Baldé'); await f.locator('input[name=phone]').fill(PHONE);
  await f.locator('input[name=date]').fill(day(3)); await f.locator('input[name=time]').fill('20:00'); await f.locator('input[name=guests]').fill('2');
  await f.getByRole('button', { name: 'Pedir reserva' }).click();
  await p.waitForURL(/\/reserva\//, { timeout: 20000 });
  const code1 = cq(`select code from reservations where customer_id = '${cid}' order by created_at desc limit 1`);
  check(!!code1, `2.7 reserva feita com a sessão iniciada fica na conta (${code1})`);
  await p.locator('[data-testid="my-reservations-link"]').click();
  check(await p.waitForURL(/\/cliente\/reservas$/).then(() => true, () => false), '2.8 na página da reserva, "As minhas reservas" leva à área da conta');
  await ready(p);
  check(await p.locator('[data-testid="client-reservation"][data-status="pending"]:visible').count() === 1, '2.9 As minhas reservas: a reserva aparece como Pendente');
  // reserva feita noutro telemóvel, SEM sessão → juntar com telefone + código
  const other = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await other.goto(C + '/reservas', { waitUntil: 'load' });
  const f2 = other.locator('form').filter({ has: other.locator('input[name=guests]') });
  await f2.locator('input[name=name]').fill('Aminata Baldé'); await f2.locator('input[name=phone]').fill(PHONE);
  await f2.locator('input[name=date]').fill(day(6)); await f2.locator('input[name=time]').fill('21:00'); await f2.locator('input[name=guests]').fill('5');
  await f2.getByRole('button', { name: 'Pedir reserva' }).click();
  await other.waitForURL(/\/reserva\//, { timeout: 20000 });
  const code2 = cq(`select code from reservations where phone like '%${PHONE}' and customer_id is null order by created_at desc limit 1`);
  await p.reload({ waitUntil: 'load' }); await ready(p);
  check(await p.locator('[data-testid="client-reservation"]:visible').count() === 1, '2.10 reserva feita noutro telemóvel sem sessão NÃO aparece sozinha (o telefone não dá acesso)');
  const claim = p.locator('[data-testid="claim-form"]:visible');
  await claim.locator('input[name=phone]').fill(PHONE); await claim.locator('input[name=code]').fill('R-ZZZZZZ');
  await claim.getByRole('button', { name: 'Juntar reserva' }).click();
  check(await waitFor(() => p.locator('text=Não encontrámos uma reserva com esse código e esse telefone.').isVisible(), 8000), '2.11 código errado → recusado');
  await claim.locator('input[name=code]').fill(code2);
  await claim.getByRole('button', { name: 'Juntar reserva' }).click();
  const u12 = await p.waitForURL(/\/cliente\/reservas\?juntada=1/, { timeout: 15000 }).then(() => true, () => false); await ready(p);
  check(u12 && await p.locator('[data-testid="claim-ok"]:visible').isVisible()
    && await p.locator('[data-testid="client-reservation"]:visible').count() === 2 && cq(`select customer_id from reservations where code = '${code2}'`) === cid, '2.12 telefone + código → a reserva passa a estar na conta');
  // gerente aprova → o cliente vê sem recarregar
  const rid = cq(`select id from reservations where code = '${code1}'`);
  await g.goto(C + '/admin/reservas', { waitUntil: 'networkidle' });
  await g.locator(`[data-testid="reservation-${code1}"]`).getByRole('button', { name: 'Aprovar' }).click();
  await waitFor(() => cq(`select status from reservations where id = '${rid}'`) === 'approved');
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  check(await waitFor(() => p.locator('[data-testid="client-reservation"][data-status="approved"]:visible').count().then((n) => n === 1), 25000), '2.13 reserva aprovada pelo gerente: o estado muda na página do cliente sem recarregar');

  // ---------- 3. Resumo e páginas com dados ----------
  await p.locator('[data-testid="client-sidebar"]:visible [data-testid="cnav-resumo"]').click(); await p.waitForURL(/\/cliente$/);
  const v = async (k) => (await p.locator(`[data-testid="summary-${k}"]:visible [data-value]`).innerText()).replace(/\s/g, ' ');
  const price = Number(cq(`select price from menu_items where id = ${item}`));
  check(await v('reservas') === '2' && await v('pagamentos') === '1' && await v('pedidos') === '2' && (await v('porpagar')).replace(/\D/g, '') === String(price),
    `3.1 Resumo: 2 próximas reservas, 1 pagamento, 2 pedidos, ${price} FCFA por pagar (dados reais)`);
  for (const [k, path] of [['reservas', '/cliente/reservas'], ['porpagar', '/cliente/pedidos'], ['pagamentos', '/cliente/pagamentos'], ['pedidos', '/cliente/pedidos']]) {
    await p.goto(C + '/cliente', { waitUntil: 'load' });
    await p.locator(`[data-testid="summary-${k}"]:visible`).click();
    check(await p.waitForURL(new RegExp(`${path.replace(/\//g, '\\/')}$`), { timeout: 10000 }).then(() => true, () => false), `3.2 cartão "${k}" do Resumo abre ${path}`);
  }
  await p.goto(C + '/cliente/pedidos', { waitUntil: 'load' }); await ready(p);
  check(await p.locator('[data-testid="client-order"]:visible').count() === 2 && await p.locator('[data-testid="client-order"][data-paid="1"]:visible').count() === 1 && /Por pagar/.test(await p.locator('[data-testid="unpaid-total"]:visible').innerText()), '3.3 Os meus pedidos: os 2 pedidos, 1 pago e o total por pagar');
  // endereços antigos com âncora
  await p.goto(C + '/cliente#meus-pagamentos', { waitUntil: 'load' });
  check(await p.waitForURL(/\/cliente\/pagamentos$/, { timeout: 10000 }).then(() => true, () => false), '3.4 endereço antigo /cliente#meus-pagamentos abre Pagamentos');

  // ---------- 4. cliente com muitos dados (85+ pedidos): páginas rápidas e completas ----------
  const AUTH = require(`${S}/auth-helper.js`);
  const big = await b.newContext({ viewport: { width: 1366, height: 900 } }); await AUTH.loginClient(big, C); const bp = await big.newPage();
  for (const [id, path] of NAV) {
    const t0 = Date.now(); await bp.goto(C + path, { waitUntil: 'load' }); await bp.waitForSelector('main:visible h1'); const ms = Date.now() - t0;
    check(ms < 4000, `4.${id} cliente com muitos dados: ${path} abre em ${ms} ms`);
  }
  await bp.goto(C + '/cliente', { waitUntil: 'load' }); await ready(bp);
  const nOrders = Number(cq(`select count(*) from orders where customer_id = '${AUTH.TEST_CLIENT_ID}'`));
  check(await bp.locator('[data-testid="client-order"]:visible').count() === 5 && /Ver todos os pedidos \(\d+\)/.test(await bp.locator('[data-testid="more-pedidos"]:visible').innerText()), '4.5 Resumo mostra só os 5 mais recentes + "Ver todos os pedidos"');
  await bp.locator('[data-testid="more-pedidos"]:visible').click(); await bp.waitForURL(/\/cliente\/pedidos$/); await ready(bp);
  check(await bp.locator('[data-testid="client-order"]:visible').count() === Math.min(nOrders, 100), `4.6 "Os meus pedidos" mostra todos (${Math.min(nOrders, 100)})`);

  // ---------- 5. telemóvel: menu ☰, cada opção abre e fecha o menu ----------
  const m = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
  m.on('pageerror', (e) => errs.push('telemóvel: ' + e.message.slice(0, 150)));
  await m.goto(C + '/cliente/entrar', { waitUntil: 'load' });
  await m.fill('input[name=identifier]', EMAIL); await m.fill('input[name=password]', PASS); await m.getByRole('button', { name: /Entrar/ }).click();
  await m.waitForURL(/\/cliente$/, { timeout: 15000 });
  for (const [id, path, h1] of NAV) {
    await m.locator('header [data-testid="menu-button"]').click();
    await m.locator(`#cliente-menu [data-testid="cnav-${id}"]`).click();
    const okNav = await m.waitForURL(new RegExp(`${path.replace(/\//g, '\\/')}$`), { timeout: 15000 }).then(() => true, () => false);
    await m.waitForSelector('main:visible h1');
    const closed = await m.locator('#cliente-menu').waitFor({ state: 'hidden', timeout: 3000 }).then(() => true, () => false);
    const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(okNav && closed && (await m.locator('main:visible h1').innerText()).startsWith(h1) && ov <= 1, `5.${id} telemóvel: ☰ → "${h1}" abre, o menu fecha, sem deslocamento horizontal`);
    if (id === 'resumo') { await ready(m); } if (id === 'resumo') await m.screenshot({ path: `${S}/cliente-resumo-telemovel.png`, fullPage: false });
  }
  await m.locator('header [data-testid="menu-button"]').click();
  await m.locator('#cliente-menu [data-testid="cnav-logout"]').click();
  check(await m.waitForURL(/\/cliente\/entrar/, { timeout: 15000 }).then(() => true, () => false), '5.5 "Terminar sessão" pelo menu → volta ao login');
  await m.goto(C + '/cliente/pagamentos', { waitUntil: 'load' });
  check(await m.waitForURL(/\/cliente\/entrar\?volta=%2Fcliente%2Fpagamentos/, { timeout: 15000 }).then(() => true, () => false), '5.6 sem sessão, /cliente/pagamentos pede login e volta à mesma página');
  await m.fill('input[name=identifier]', EMAIL); await m.fill('input[name=password]', PASS); await m.getByRole('button', { name: /Entrar/ }).click();
  check(await m.waitForURL(/\/cliente\/pagamentos$/, { timeout: 15000 }).then(() => true, () => false), '5.7 depois do login volta a Pagamentos');

  // ---------- 6. privacidade: outro cliente não vê nada destes ----------
  const pid = cq(`select payment_id from orders where id = '${o1.orderId}'`);
  await bp.goto(`${C}/cliente/recibos/${pid}`, { waitUntil: 'load' });
  await bp.locator('text=Página não encontrada').waitFor({ timeout: 15000 }).catch(() => {});
  const body = await bp.locator('body').innerText();
  check(/Página não encontrada/.test(body) && !/Orange Money/.test(body) && !/REC-\d/.test(body), '6.1 outro cliente não abre o recibo deste ("Página não encontrada", sem nenhum dado)');
  await bp.goto(C + '/cliente/reservas', { waitUntil: 'load' });
  check(!(await bp.locator('main:visible').innerText()).includes(code1), '6.2 outro cliente não vê as reservas deste');

  await p.goto(C + '/cliente', { waitUntil: 'load' }); await ready(p); await p.screenshot({ path: `${S}/cliente-resumo-computador.png` });
  await b.close();
  cq("delete from admin_users where email = 'cli.gerente@nokau.test'");
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n').slice(0, 3).join(' | ')); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
