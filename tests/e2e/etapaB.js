/* Etapa B — pagamentos e recibos: número de recibo, recibo (gerente e cliente), perfil do cliente, tempo real, anulação,
   sincronização servidor local → central e limites partilhados. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const S = __dirname;
const C = 'http://localhost:3100', L = 'http://localhost:3200';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tA -v ON_ERROR_STOP=1 -q`, { input: s }).toString().trim();
const cq = (s) => q('nokau_test', s), lq = (s) => q('nokau_local', s);
const srv = (a) => execSync(`${S}/servers.sh ${a}`, { stdio: 'pipe' });
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
let kn = 0; const key = () => `etapab${Date.now().toString(36)}${(kn++).toString().padStart(6, '0')}`;
const watch = (p, tag) => p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message.slice(0, 150)}`));

async function staffLogin(b, base, tag) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); watch(p, tag);
  await p.goto(base + '/admin/login', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', 'gerente@nokau.test'); await p.fill('input[name=password]', 'senha-forte-123'); await p.click('button[type=submit]');
  await p.waitForURL(/\/admin\/(dashboard|mesas)/, { timeout: 20000 }); await p.waitForLoadState('networkidle');
  return p;
}
async function pay(p, base, number, method, tendered) {
  await p.goto(base + '/admin/mesas', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Todas' }).click().catch(() => {});
  await p.locator(`[data-testid="table-${number}"]`).click();
  await p.waitForSelector('[data-testid="table-bill"]');
  const total = Number((await p.locator('[data-testid="bill-total"]').innerText()).replace(/\D/g, ''));
  await p.locator('[data-testid="table-bill"] label', { hasText: method }).click();
  if (tendered) await p.locator('[data-testid="bill-tendered"]').fill(String(total + tendered));
  await p.locator('[data-testid="bill-confirm"]').click();
  await waitFor(() => p.locator('[data-testid="bill-paid"]').isVisible(), 15000);
  return total;
}

(async () => {
  srv('both');
  await waitFor(() => cq("select count(*) from information_schema.columns where table_name = 'payments' and column_name = 'receipt_number'") === '1'
    && lq("select count(*) from information_schema.columns where table_name = 'payments' and column_name = 'receipt_number'") === '1', 60000);
  await waitFor(() => lq("select count(*) from admin_users where email = 'gerente@nokau.test'") === '1', 60000);
  cq('delete from auth_throttle'); lq('delete from auth_throttle');
  cq("update menu_items set available = true, active = true where name in ('Frango Churrasco','Moelas')");
  const b = await chromium.launch();

  // ---------- 1. Números de recibo ----------
  check(cq("select count(*) from payments where receipt_number is null") === '0', `1.1 todos os ${cq('select count(*) from payments')} pagamentos existentes têm número de recibo`);
  check(cq("select count(*) from (select origin, receipt_number from payments group by 1,2 having count(*) > 1) x") === '0', '1.2 números únicos por série (central / local)');
  // pagamento inserido por outro caminho (sem número): a base de dados atribui o seguinte da série
  const t1 = cq('select id from dining_tables order by id limit 1');
  const m0 = Number(cq("select coalesce(max(receipt_number),0) from payments where origin = 'central'"));
  const direct = cq(`insert into payments (table_id, amount, method, received_by, idempotency_key) values (${t1}, 100, 'card', 'teste-direto', 'direto${Date.now()}00000000') returning receipt_number`);
  check(Number(direct) === m0 + 1, `1.3 pagamento inserido sem número recebe o seguinte da série (${direct})`);
  const before = Number(cq("select coalesce(max(receipt_number),0) from payments where origin = 'central'"));

  // ---------- 2. Cliente com conta faz um pedido; outra pessoa na mesma mesa (sem conta) também ----------
  const T = 9;
  const tok = cq(`select qr_token from dining_tables where number = ${T}`);
  const frango = Number(cq("select id from menu_items where name = 'Frango Churrasco' limit 1"));
  const moelas = Number(cq("select id from menu_items where name = 'Moelas' limit 1"));
  const cctx = await b.newContext({ ...devices['Pixel 7'] }); const c = await cctx.newPage(); watch(c, 'cliente');
  const email = `recibo${Date.now()}@teste.gw`, tel = '96' + String(Date.now()).slice(-7);
  await c.goto(`${C}/cliente/registo?volta=/m/${tok}`, { waitUntil: 'networkidle' });
  await c.fill('input[name=name]', 'Aissatu Recibo'); await c.fill('input[name=email]', email); await c.fill('input[name=phone]', tel);
  await c.fill('input[name=password]', 'cliente-senha-9'); await c.fill('input[name=password2]', 'cliente-senha-9'); await c.locator('input[name=consent]').check();
  await c.getByRole('button', { name: 'Criar conta' }).click(); await c.waitForURL(new RegExp(`/m/${tok}$`), { timeout: 20000 }); await c.waitForLoadState('networkidle');
  await c.getByRole('button', { name: 'Adicionar Frango Churrasco', exact: true }).click();
  await c.getByRole('button', { name: 'Mais Frango Churrasco' }).click();
  await c.getByRole('button', { name: /Ver pedido/ }).click();
  await c.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await c.waitForURL(/\/pedido\//, { timeout: 20000 });
  const cid = cq(`select id from customers where email = '${email}'`);
  check(cq(`select count(*) from orders where customer_id = '${cid}'`) === '1', '2.1 pedido do cliente ligado à conta');
  const AUTH = require('./auth-helper.js');
  const anon = await (await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(C) }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: moelas, quantity: 1 }] }) })).json();
  check(!!anon.orderId, '2.2 outra pessoa na mesma mesa pede com a sua própria conta');

  // ---------- 3. Gerente confirma; o painel de Pagamentos de outro gerente atualiza sozinho ----------
  const watcher = await staffLogin(b, C, 'gerente-pagamentos');
  await watcher.goto(C + '/admin/pagamentos?r=hoje', { waitUntil: 'networkidle' });
  await watcher.waitForSelector('text=Ao vivo', { timeout: 20000 });
  const countBefore = await watcher.locator('[data-testid^="payment-"][data-status]').count();
  const g = await staffLogin(b, C, 'gerente');
  const t0 = Date.now();
  const total = await pay(g, C, T, 'Pagamento à mão', 2000);
  const pid = cq(`select id from payments where table_id = (select id from dining_tables where number = ${T}) order by created_at desc limit 1`);
  const rn = Number(cq(`select receipt_number from payments where id = '${pid}'`));
  check(rn === before + 1, `3.1 recibo com o número seguinte da série (REC-${String(rn).padStart(6, '0')}; anterior ${before})`);
  const live = await waitFor(async () => (await watcher.locator('[data-testid^="payment-"][data-status]').count()) > countBefore, 20000, 250);
  check(live, `3.2 pagamentos em tempo real: aparece no painel de outro gerente sem recarregar (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const row = watcher.locator(`[data-testid="payment-${pid}"]`);
  check(/REC-\d{6} · Confirmado/.test(await row.locator('[data-testid="payment-receipt-number"]').innerText()), '3.3 a lista mostra o número do recibo e o estado');
  await watcher.goto(C + '/admin/dashboard?r=hoje', { waitUntil: 'networkidle' });
  check(Number(await watcher.locator('[data-testid="hero-paid"]').getAttribute('data-raw')) >= total, '3.4 Visão geral mostra os pagamentos recebidos no período');

  // ---------- 4. Recibo no painel (gerente / admin) ----------
  await watcher.goto(C + '/admin/pagamentos?r=hoje', { waitUntil: 'networkidle' });
  await watcher.locator(`[data-testid="payment-${pid}"] [data-testid="payment-receipt-link"]`).click();
  await watcher.waitForURL(new RegExp(`/admin/pagamentos/${pid}$`)); await watcher.waitForSelector('[data-testid="receipt"]');
  const rtext = await watcher.locator('[data-testid="receipt"]').innerText();
  check(/REC-\d{6}/.test(rtext) && /Pago · confirmado/i.test(rtext), '4.1 recibo: número e estado "Pago · confirmado"');
  check((await watcher.locator('[data-testid="receipt-total"]').innerText()).replace(/\D/g, '') === String(total), `4.2 recibo: valor total (${total} FCFA)`);
  check(/Dinheiro \(à mão\)/.test(rtext) && /Entregue/.test(rtext) && /Troco\s*2\s?000/.test(rtext.replace(/ | /g, ' ')), '4.3 recibo: método, valor entregue e troco');
  check(/2x Frango Churrasco/.test(rtext) && /1x Moelas/.test(rtext), '4.4 recibo do gerente: todos os produtos pagos');
  check(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/.test(rtext) && /Recebido por/.test(rtext), '4.5 recibo: data/hora e quem recebeu');
  await watcher.emulateMedia({ media: 'print' });
  const bg = await watcher.locator('[data-testid="receipt"]').evaluate((e) => getComputedStyle(e).backgroundColor);
  const nav = await watcher.locator('aside').first().isVisible().catch(() => false);
  check(/255, 255, 255|rgba\(0, 0, 0, 0\)/.test(bg) && !nav, '4.6 ao imprimir: recibo a preto e branco, sem menus');
  await watcher.emulateMedia({ media: 'screen' });

  // ---------- 5. Cliente: perfil e recibo ----------
  await c.goto(C + '/cliente', { waitUntil: 'networkidle' });
  const cp = c.locator('[data-testid="client-payment"]');
  check(await cp.count() === 1 && /Pago · ver recibo/i.test(await cp.first().innerText()) && /REC-\d{6}/.test(await cp.first().innerText()), '5.1 perfil do cliente: "Pagamentos e recibos" com valor, data, número e estado');
  await cp.first().click(); await c.waitForURL(new RegExp(`/cliente/recibos/${pid}$`)); await c.waitForSelector('[data-testid="receipt"]');
  const ctext = await c.locator('[data-testid="receipt"]').innerText();
  check(/2x Frango Churrasco/.test(ctext) && !/Moelas/.test(ctext) && /Outros consumos da mesa/.test(ctext), '5.2 recibo do cliente: os seus produtos; consumos de outras pessoas só como total');
  check((await c.locator('[data-testid="receipt-total"]').innerText()).replace(/\D/g, '') === String(total) && await c.locator('[data-testid="receipt-print"]').isVisible(), '5.3 recibo do cliente: total pago e botão imprimir/PDF');
  // outra conta não vê; sem sessão pede login e volta ao recibo
  const octx = await b.newContext(); const o = await octx.newPage();
  await o.goto(`${C}/cliente/registo`, { waitUntil: 'networkidle' });
  await o.fill('input[name=name]', 'Outra Conta'); await o.fill('input[name=email]', `outra${Date.now()}@teste.gw`); await o.fill('input[name=phone]', '97' + String(Date.now()).slice(-7));
  await o.fill('input[name=password]', 'outra-senha-12'); await o.fill('input[name=password2]', 'outra-senha-12'); await o.locator('input[name=consent]').check();
  await o.getByRole('button', { name: 'Criar conta' }).click(); await o.waitForURL(/\/cliente$/, { timeout: 20000 });
  const res = await o.goto(`${C}/cliente/recibos/${pid}`, { waitUntil: 'networkidle' });
  check(res.status() === 404 || await o.locator('[data-testid="receipt"]').count() === 0, '5.4 outra conta NÃO vê o recibo (como se não existisse)');
  const nctx = await b.newContext(); const n = await nctx.newPage();
  await n.goto(`${C}/cliente/recibos/${pid}`, { waitUntil: 'networkidle' });
  check(/\/cliente\/entrar\?volta=/.test(n.url()), '5.5 sem sessão → pede login');
  await n.fill('input[name=identifier]', email); await n.fill('input[name=password]', 'cliente-senha-9'); await n.getByRole('button', { name: 'Entrar' }).click();
  check(await waitFor(() => n.locator('[data-testid="receipt"]').isVisible(), 15000) && new RegExp(`/cliente/recibos/${pid}$`).test(n.url()), '5.6 depois do login volta ao recibo');
  const evil = await (await b.newContext()).newPage();
  await evil.goto(`${C}/cliente/entrar?volta=https://exemplo-malicioso.com/cliente/recibos/${pid}`, { waitUntil: 'networkidle' });
  await evil.fill('input[name=identifier]', email); await evil.fill('input[name=password]', 'cliente-senha-9'); await evil.getByRole('button', { name: 'Entrar' }).click();
  await evil.waitForURL(/localhost:3100\/cliente/, { timeout: 15000 }).catch(() => {});
  check(new URL(evil.url()).host === 'localhost:3100', '5.7 redirecionamento após login só para páginas do próprio site');

  // ---------- 6. Anulação e imutabilidade ----------
  await watcher.goto(C + '/admin/pagamentos?r=hoje', { waitUntil: 'networkidle' });
  const r2 = watcher.locator(`[data-testid="payment-${pid}"]`);
  await r2.getByRole('button', { name: 'Anular…' }).click();
  await r2.locator('input').fill('Teste: valor registado na mesa errada');
  await r2.getByRole('button', { name: 'Confirmar anulação' }).click();
  await waitFor(() => watcher.locator(`[data-testid="payment-${pid}"][data-status="voided"]`).isVisible(), 10000);
  check(/Pedidos: #\d{4}/.test(await watcher.locator(`[data-testid="payment-${pid}"]`).innerText()), '6.0 na lista, o pagamento anulado continua a mostrar os pedidos a que se referia');
  await c.goto(`${C}/cliente/recibos/${pid}`, { waitUntil: 'networkidle' });
  const vtext = await c.locator('[data-testid="receipt"]').innerText();
  check(/anulado/i.test(vtext) && /mesa errada/.test(vtext) && Number(cq(`select receipt_number from payments where id = '${pid}'`)) === rn, '6.1 anulado: o recibo mostra "Anulado", o motivo e mantém o número');
  await c.goto(C + '/cliente', { waitUntil: 'networkidle' });
  check(/Anulado/i.test(await c.locator('[data-testid="client-payment"]').first().innerText()), '6.2 perfil do cliente mostra o pagamento como anulado');
  let blocked = false; try { cq(`update payments set receipt_number = 999999 where id = '${pid}'`); } catch { blocked = true; }
  check(blocked && Number(cq(`select receipt_number from payments where id = '${pid}'`)) === rn, '6.3 a base de dados recusa mudar o número de um recibo');
  let del = false; try { cq(`delete from payments where id = '${pid}'`); } catch { del = true; }
  check(del, '6.4 a base de dados recusa apagar pagamentos');
  const total2 = await pay(g, C, T, 'Telecel');
  const pid2 = cq(`select id from payments where table_id = (select id from dining_tables where number = ${T}) and status = 'confirmed' order by created_at desc limit 1`);
  check(total2 === total && Number(cq(`select receipt_number from payments where id = '${pid2}'`)) === rn + 1, '6.5 cobrado de novo → novo recibo com o número seguinte (o anulado não é reutilizado)');
  check(cq(`select count(*) from orders where id in (select o.id from orders o where o.customer_id = '${cid}') and payment_id = '${pid2}'`) === '1', '6.6 cada pedido só fica pago uma vez');

  // ---------- 7. Servidor local → central ----------
  const TL = 10;
  const tokL = lq(`select qr_token from dining_tables where number = ${TL}`);
  const lo = await (await fetch(`${L}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(L) }, body: JSON.stringify({ token: tokL, key: key(), lines: [{ itemId: frango, quantity: 1 }] }) })).json();
  check(!!lo.orderId, '7.1 pedido feito no servidor do restaurante');
  await waitFor(() => cq(`select count(*) from orders where id = '${lo.orderId}'`) === '1', 30000);
  const lmax = Number(lq("select coalesce(max(receipt_number),0) from payments where origin = 'local'"));
  const lg = await staffLogin(b, L, 'gerente-local');
  await pay(lg, L, TL, 'Orange Money');
  const lpid = lq(`select id from payments where origin = 'local' order by created_at desc limit 1`);
  const lrn = Number(lq(`select receipt_number from payments where id = '${lpid}'`));
  check(lrn === lmax + 1, `7.2 recibo do servidor local na série própria (REC-L${String(lrn).padStart(6, '0')})`);
  check(await waitFor(() => cq(`select receipt_number from payments where id = '${lpid}'`) === String(lrn), 40000), '7.3 chega ao site central com o MESMO número de recibo');
  await watcher.goto(`${C}/admin/pagamentos/${lpid}`, { waitUntil: 'networkidle' });
  check(/REC-L\d{6}/.test(await watcher.locator('[data-testid="receipt-number"]').innerText()), '7.4 o gerente vê o recibo do restaurante no painel online');
  check(cq("select count(*) from (select origin, receipt_number from payments group by 1,2 having count(*) > 1) x") === '0'
    && lq("select count(*) from (select origin, receipt_number from payments group by 1,2 having count(*) > 1) x") === '0', '7.5 sem números repetidos nos dois servidores');

  // ---------- 8. Limites partilhados (base de dados) ----------
  cq('delete from auth_throttle');
  let codes = [];
  for (let i = 0; i < 31; i++) codes.push((await fetch(`${C}/api/sync/orders`, { headers: { authorization: 'Bearer errado-' + i, 'x-forwarded-for': '10.7.7.7' } })).status);
  check(codes.slice(0, 30).every((x) => x === 401) && codes[30] === 429, '8.1 30 tentativas erradas ao segredo da sincronização → bloqueado (429)');
  srv('central');
  let after = 0; await waitFor(async () => { after = (await fetch(`${C}/api/sync/orders`, { headers: { authorization: 'Bearer errado', 'x-forwarded-for': '10.7.7.7', connection: 'close' } })).status; return true; }, 30000);
  check(after === 429, '8.2 continua bloqueado depois de reiniciar o servidor (limite na base de dados)');
  const other = (await fetch(`${C}/api/sync/orders`, { headers: { authorization: 'Bearer errado', 'x-forwarded-for': '10.7.7.8' } })).status;
  check(other === 401, '8.3 outro IP não é afetado (o restaurante não pode ser bloqueado por terceiros)');
  const n0 = Number(cq('select count(*) from auth_throttle'));
  await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.8.8.8', cookie: AUTH.clientCookie(C) }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: moelas, quantity: 1 }] }) });
  check(Number(cq('select count(*) from auth_throttle')) === n0 + 1, '8.4 pedidos contados no limite partilhado (guardado como hash)');
  cq('delete from auth_throttle');

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message, e.cause?.code ?? '', e.cause?.message ?? '', (e.stack || '').split('\n').slice(1, 3).join(' | ')); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
