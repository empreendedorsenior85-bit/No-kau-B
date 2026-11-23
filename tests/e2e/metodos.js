/* Métodos de pagamento: só Orange Money, Telecel e Pagamento à mão (dinheiro) para pagamentos novos;
   os desativados (MTN MoMo, cartão, transferência) continuam no histórico, nos recibos, relatórios e na sincronização. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process'); const crypto = require('node:crypto');
const S = __dirname;
const AUTH = require(`${S}/auth-helper.js`);
const C = 'http://localhost:3100';
const TOKEN = 'sync-token-de-teste-0123456789abcdefghij';
const cq = (s) => execSync('psql -h localhost -p 5433 -U postgres -d nokau_test -tA -q -v ON_ERROR_STOP=1', { input: s }).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; }
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };
const TODAY = new Date().toISOString().slice(0, 10), FROM = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const EXPECTED = ['Orange Money', 'Telecel', 'Pagamento à mão (dinheiro)'];
let kn = 0; const key = () => `metodos${Date.now().toString(36)}${(kn++).toString().padStart(6, '0')}`;

(async () => {
  execSync(`${S}/servers.sh central`, { stdio: 'pipe' });
  cq('delete from auth_throttle');
  cq("delete from admin_users where email = 'pay.gerente@nokau.test'");
  cq(`insert into admin_users (email, password_hash, role, name) values ('pay.gerente@nokau.test', '${hashPw('pay-gerente-1')}', 'gerente', 'Gerente Pay')`);
  check(cq("select pg_get_constraintdef(oid) like '%telecel%' from pg_constraint where conname = 'payments_method_check'") === 't', '0.1 base de dados aceita "telecel" (migração aplicada)');
  const legacy = cq("select string_agg(method || ':' || n, ',' order by method) from (select method, count(*) n from payments where method in ('mtn_momo','card','transfer') group by 1) x");
  check(!!legacy, `0.2 há pagamentos antigos com métodos desativados na base de testes (${legacy}) — devem continuar visíveis`);
  const item = Number(cq("select id from menu_items where name = 'Moelas' and active limit 1")); cq(`update menu_items set available = true where id = ${item}`);
  const used = new Set();
  const freeTable = () => { const n = Number(cq(`select number from dining_tables t where active ${used.size ? `and number not in (${[...used].join(',')})` : ''} order by (select count(*) from orders o where o.table_id = t.id and o.created_at > now() - interval '10 minutes'), number limit 1`)); used.add(n); return n; };
  const order = async (T) => (await (await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(C) }, body: JSON.stringify({ token: cq(`select qr_token from dining_tables where number = ${T}`), key: key(), lines: [{ itemId: item, quantity: 2 }] }) })).json());

  // ---------- 6. (primeiro) Sincronização: pagamentos antigos do servidor local continuam a ser aceites ----------
  const tid = Number(cq('select id from dining_tables where active order by number limit 1'));
  const oid = cq(`insert into orders (table_id, status, total, idempotency_key, is_test) values (${tid}, 'done', 1000, '${key()}', true) returning id`);
  const legacyPay = { id: crypto.randomUUID(), origin: 'local', tableId: tid, amount: 1000, method: 'mtn_momo', tendered: null, receivedBy: 'Gerente local', note: 'pagamento antigo (antes da mudança)',
    status: 'confirmed', voidedAt: null, voidedBy: null, voidReason: null, idempotencyKey: key(), createdAt: new Date(Date.now() - 86400000).toISOString(), statusChangedAt: new Date(Date.now() - 86400000).toISOString(), orderIds: [oid], receiptNumber: 990000 + Math.floor(Math.random() * 9999) };
  const oid2 = cq(`insert into orders (table_id, status, total, idempotency_key, is_test) values (${tid}, 'done', 1500, '${key()}', true) returning id`);
  const legacyCard = { ...legacyPay, id: crypto.randomUUID(), idempotencyKey: key(), method: 'card', amount: 1500, orderIds: [oid2], receiptNumber: legacyPay.receiptNumber + 1 };
  const sr = await (await fetch(`${C}/api/sync/payments`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ payments: [legacyPay, legacyCard] }) })).json();
  check(cq(`select string_agg(method, ',' order by method) from payments where id in ('${legacyPay.id}','${legacyCard.id}')`) === 'card,mtn_momo' && !(sr.rejected ?? []).length, '6.1 pagamentos ANTIGOS (MTN MoMo e cartão) vindos do servidor local são aceites (não se perdem na sincronização)');
  const badPay = { ...legacyPay, id: crypto.randomUUID(), idempotencyKey: key(), method: 'bitcoin' };
  const sr2 = await (await fetch(`${C}/api/sync/payments`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ payments: [badPay] }) })).json();
  check((sr2.rejected ?? []).some((r) => r.id === badPay.id) && cq(`select count(*) from payments where id = '${badPay.id}'`) === '0', '6.2 método desconhecido continua recusado na sincronização');

  const b = await chromium.launch();
  const login = async (opts) => {
    const ctx = await b.newContext(opts); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 150)));
    await p.goto(C + '/admin/login'); await p.fill('input[name=email]', 'pay.gerente@nokau.test'); await p.fill('input[name=password]', 'pay-gerente-1'); await p.click('button[type=submit]');
    await p.waitForURL(/\/admin\/dashboard/); return p;
  };
  const g = await login({ viewport: { width: 1366, height: 900 } });

  // ---------- 1. Conta da mesa (Mesas → mesa → Conta): só as 3 opções ----------
  const T1 = freeTable(); const o1 = await order(T1);
  await g.goto(C + '/admin/mesas', { waitUntil: 'networkidle' }); await g.getByRole('button', { name: 'Todas' }).click().catch(() => {});
  await g.locator(`[data-testid="table-${T1}"]`).click(); await g.waitForSelector('[data-testid="table-bill"]');
  const billOpts = (await g.locator('[data-testid="table-bill"] label:has(input[type=radio])').allInnerTexts()).map((t) => t.trim());
  check(JSON.stringify(billOpts) === JSON.stringify(EXPECTED), `1.1 conta da mesa: ${billOpts.join(' | ')}`);
  // Telecel
  await g.locator('[data-testid="table-bill"] label', { hasText: 'Telecel' }).click();
  await g.locator('[data-testid="bill-confirm"]').click();
  check(await waitFor(() => g.locator('[data-testid="bill-paid"]').isVisible()) && /Telecel/.test(await g.locator('[data-testid="bill-paid"]').innerText()), '1.2 pagamento com Telecel confirmado');
  const p1 = cq(`select id||'|'||method from payments where id = (select payment_id from orders where id = '${o1.orderId}')`);
  check(p1.endsWith('|telecel'), '1.3 guardado na base de dados como "telecel"');
  const pid1 = p1.split('|')[0];

  // ---------- 2. Receber pagamento no pedido: só as 3 opções; dinheiro com troco ----------
  const T2 = freeTable(); const o2 = await order(T2);
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  const card = g.locator(`[data-testid="order-${o2.number}"]`);
  await card.locator('[data-testid="order-pay-open"]').click();
  const payOpts = (await card.locator('[data-testid="order-pay"] label').allInnerTexts()).map((t) => t.trim()).filter((t) => !/Valor entregue/.test(t));
  check(JSON.stringify(payOpts) === JSON.stringify(EXPECTED), `2.1 "Receber pagamento" no pedido: ${payOpts.join(' | ')}`);
  await card.locator('[data-testid="order-pay"] label', { hasText: 'Pagamento à mão' }).click();
  const total = Number(cq(`select total from orders where id = '${o2.orderId}'`));
  await card.locator('[data-testid="order-pay"] input[inputmode=numeric]').fill(String(total + 1000));
  check(await card.locator('text=Troco: 1').isVisible(), '2.2 pagamento à mão: pede o valor entregue e mostra o troco');
  await card.locator('[data-testid="order-pay-confirm"]').click();
  await waitFor(() => card.locator('[data-testid="order-paid"]').isVisible());
  const p2 = cq(`select id||'|'||method||'|'||tendered from payments where id = (select payment_id from orders where id = '${o2.orderId}')`);
  check(p2.split('|')[1] === 'cash' && Number(p2.split('|')[2]) === total + 1000, '2.3 guardado como "cash" com o valor entregue');
  const pid2 = p2.split('|')[0];

  // ---------- 3. Servidor recusa métodos desativados (mesmo que alguém altere o pedido) ----------
  const T3 = freeTable(); const o3 = await order(T3);
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  const card3 = g.locator(`[data-testid="order-${o3.number}"]`);
  await card3.locator('[data-testid="order-pay-open"]').click();
  await card3.locator('[data-testid="order-pay"] label', { hasText: 'Orange Money' }).click();
  // troca "orange_money" por um método desativado no pedido enviado ao servidor
  for (const bad2 of ['card', 'mtn_momo', 'transfer']) {
    await g.route('**/admin/pedidos', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && (req.postData() ?? '').includes('orange_money')) return route.continue({ postData: req.postData().replace(/orange_money/g, bad2) });
      return route.continue();
    });
    await card3.locator('[data-testid="order-pay-confirm"]').click();
    const msg = await waitFor(() => card3.locator('[role=alert]').innerText().then((t) => /Orange Money, Telecel ou pagamento à mão/.test(t)), 10000);
    check(msg && cq(`select count(*) from orders where id = '${o3.orderId}' and payment_id is not null`) === '0', `3.${bad2} método desativado "${bad2}" recusado pelo servidor (nada é registado)`);
    await g.unroute('**/admin/pedidos');
  }
  await card3.locator('[data-testid="order-pay-confirm"]').click();
  check(await waitFor(() => card3.locator('[data-testid="order-paid"]').isVisible()) && cq(`select p.method from payments p join orders o on o.payment_id = p.id where o.id = '${o3.orderId}'`) === 'orange_money', '3.4 com Orange Money (sem alteração) é aceite');

  // ---------- 4. Recibos, lista, relatórios ----------
  await g.goto(`${C}/admin/pagamentos/${pid1}`, { waitUntil: 'networkidle' });
  check(/Telecel/.test(await g.locator('[data-testid="receipt"]').innerText()), '4.1 recibo (gerente): método Telecel');
  await g.goto(`${C}/admin/pagamentos/${pid2}`, { waitUntil: 'networkidle' });
  const r2 = (await g.locator('[data-testid="receipt"]').innerText()).replace(/\s+/g, ' ');
  check(/Dinheiro \(à mão\)/.test(r2) && /Entregue/.test(r2) && /Troco/.test(r2), '4.2 recibo do pagamento à mão: "Dinheiro (à mão)", entregue e troco (nome curto: cabe no papel de 58 mm)');
  await g.goto(`${C}/admin/pagamentos?r=custom&de=${FROM}&ate=${TODAY}`, { waitUntil: 'networkidle' });
  const list = await g.locator('[data-testid="payments-list"]').innerText();
  check(/Telecel/.test(list) && /Pagamento à mão \(dinheiro\)/.test(list) && /Orange Money/.test(list), '4.3 lista de Pagamentos mostra os 3 métodos com os nomes novos');
  check(/Cartão \(TPA\)/.test(list) && /MTN MoMo/.test(list), '4.4 pagamentos ANTIGOS com cartão / MTN MoMo continuam no histórico com o nome original');
  const csv = await (await g.context().request.get(`${C}/admin/relatorios/csv?tipo=pagamentos&r=custom&de=${FROM}&ate=${TODAY}`)).text();
  check(csv.includes(';Telecel;') && csv.includes(';Pagamento à mão (dinheiro);') && csv.includes(';Cartão (TPA);'), '4.5 CSV de pagamentos: nomes novos e históricos');
  await g.goto(`${C}/admin/pagamentos?r=hoje`, { waitUntil: 'networkidle' });
  const sum = await g.locator('[data-testid="payments-summary"]').innerText();
  check(/TELECEL|Telecel/i.test(sum) && /PAGAMENTO À MÃO|Pagamento à mão/i.test(sum), '4.6 resumo por método (hoje) com Telecel e Pagamento à mão');

  // ---------- 5. Cliente: vê as opções aceites e o método do seu pagamento ----------
  const cctx = await b.newContext({ ...devices['iPhone 13'] }); await AUTH.loginClient(cctx, C); const cp = await cctx.newPage();
  cp.on('pageerror', (e) => errs.push('cliente: ' + e.message.slice(0, 150)));
  const T5 = freeTable();
  await cp.goto(`${C}/m/${cq(`select qr_token from dining_tables where number = ${T5}`)}`, { waitUntil: 'networkidle' });
  await cp.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click();
  await cp.getByRole('button', { name: /Ver pedido/ }).click();
  const cartTxt = await cp.locator('[data-testid="cart-payment-methods"]').innerText().catch(() => '');
  check(/Orange Money, Telecel ou pagamento à mão \(dinheiro\)/.test(cartTxt), `5.1 carrinho (antes de enviar): "${cartTxt.slice(0, 90)}"`);
  await cp.keyboard.press('Escape'); await cp.goto(`${C}/m/${cq(`select qr_token from dining_tables where number = ${T5}`)}`, { waitUntil: 'networkidle' });
  await cp.locator('[data-testid="call-bill"]').click().catch(() => {});
  check(await waitFor(() => cp.locator('[data-testid="bill-payment-methods"]').innerText().then((t) => /Orange Money, Telecel ou pagamento à mão/.test(t)), 10000), '5.2 "Pedir a conta": mostra as 3 formas de pagar');
  await cp.goto(C + '/cliente/pagamentos', { waitUntil: 'load' }); await cp.locator('main:visible h1').waitFor(); await sleep(800);
  const cl = await cp.locator('main:visible').innerText();
  check(/Orange Money, Telecel ou pagamento à mão \(dinheiro\)/.test(cl) && /Telecel/.test(cl) && /Pagamento à mão \(dinheiro\)/.test(cl), '5.3 área do cliente: formas aceites + pagamentos Telecel e à mão');
  cq(`update service_calls set status = 'done', done_at = now(), done_by = 'teste', status_changed_at = now() where status in ('open','ack') and table_id = (select id from dining_tables where number = ${T5})`);

  // ---------- 7. telemóvel ----------
  const gm = await login({ ...devices['Pixel 7'] });
  const T7 = freeTable(); await order(T7);
  await gm.goto(C + '/admin/mesas', { waitUntil: 'networkidle' }); await gm.getByRole('button', { name: 'Todas' }).click().catch(() => {});
  await gm.locator(`[data-testid="table-${T7}"]`).click(); await gm.waitForSelector('[data-testid="table-bill"]');
  const boxes = await gm.locator('[data-testid="table-bill"] label:has(input[type=radio])').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, right: r.right, h: r.height, cut: e.scrollWidth > e.clientWidth + 1 }; }));
  check(boxes.length === 3 && boxes.every((x) => x.right <= 412 && x.h >= 44 && !x.cut), '7.1 telemóvel: as 3 opções cabem no ecrã, sem texto cortado, área de toque ≥ 44 px');
  await gm.locator('[data-testid="table-bill"]').screenshot({ path: `${S}/metodos-telemovel.png` });

  await b.close();
  cq("delete from admin_users where email = 'pay.gerente@nokau.test'");
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n').slice(0, 3).join(' | ')); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
