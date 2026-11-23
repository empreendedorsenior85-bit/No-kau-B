/* Servidor local do restaurante ↔ servidor central: arranque do zero, internet desligada, concorrência, conflitos, segurança. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const S = __dirname;
const C = 'http://localhost:3100', L = 'http://localhost:3200';
const TOKEN = 'sync-token-de-teste-0123456789abcdefghij';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tAc "${s.replace(/"/g, '\\"')}"`).toString().trim();
const cq = (s) => q('nokau_test', s), lq = (s) => q('nokau_local', s);
const srv = (a) => execSync(`${S}/servers.sh ${a}`, { stdio: 'pipe' });
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 20000, step = 400) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
let n = 0; const key = () => `synctest${Date.now().toString(36)}${(n++).toString().padStart(6, '0')}xx`.slice(0, 40);
async function order(base, tok, itemId, qty = 1, k = key()) {
  const r = await fetch(`${base}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: require('./auth-helper.js').clientCookie(base) }, body: JSON.stringify({ token: tok, key: k, lines: [{ itemId, quantity: qty }] }) });
  return { status: r.status, body: await r.json(), key: k };
}
async function login(ctx, base) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${base} pageerror: ${e.message.slice(0, 150)}`));
  await p.goto(base + '/admin/login', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', 'gerente@nokau.test'); await p.fill('input[name=password]', 'senha-forte-123'); await p.click('button[type=submit]');
  await p.waitForURL('**/admin/dashboard', { timeout: 20000 });
  return p;
}

(async () => {
  // ---------- 0. servidor local novo, SEM internet (central desligado) ----------
  srv('stop');
  q('postgres', 'drop database if exists nokau_local'); q('postgres', 'create database nokau_local');
  cq("update menu_items set available = true where name in ('Frango Churrasco','Moelas','Linguiça')");
  cq("delete from orders where idempotency_key like 'synctest%' or idempotency_key like 'manualkey%'"); // execuções anteriores (limite de 20 pedidos/mesa/10 min)
  // 250 pedidos antigos no central: garante o cenário de uma sincronização grande (passo 11.5)
  cq("insert into orders (table_id, total, idempotency_key, status, created_at) select (select id from dining_tables where number = 9), 1000, 'synctestbulk' || lpad(g::text, 8, '0'), 'done', now() - interval '2 days' from generate_series(1,250) g");
  cq("insert into order_items (order_id, menu_item_id, name, unit_price, quantity) select o.id, (select id from menu_items where name = 'Moelas'), 'Moelas', 1000, 1 from orders o where o.idempotency_key like 'synctestbulk%'");
  srv('local');
  const b = await chromium.launch();
  const lctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const lp0 = await lctx.newPage();
  await lp0.goto(L + '/admin/login', { waitUntil: 'networkidle' });
  check(await lp0.locator('text=A aguardar a primeira sincronização').isVisible(), '0.1 local sem dados e sem internet: "A aguardar a primeira sincronização" (não pede para criar conta)');
  check(lq("select count(*) from dining_tables") === '0', '0.2 local NÃO cria mesas próprias (viriam com outros tokens)');

  // ---------- 1. internet volta: catálogo completo chega ----------
  srv('central');
  check(await waitFor(() => lq("select count(*) from admin_users") === cq("select count(*) from admin_users"), 30000), '1.1 catálogo recebido após ligação');
  const parity = (s) => [cq(s), lq(s)];
  for (const [label, s] of [
    ['produtos', 'select count(*) from menu_items'], ['produtos ativos', 'select count(*) from menu_items where active and available'],
    ['preços', 'select sum(price) from menu_items'], ['categorias ativas', 'select count(*) from menu_categories where active'],
    ['tokens das mesas', "select md5(string_agg(id||':'||number||':'||qr_token||':'||active, ',' order by id)) from dining_tables"],
    ['fotos', 'select count(*) from menu_items where image_path is not null'], ['utilizadores', "select md5(string_agg(email||role||password_hash, ',' order by email)) from admin_users"],
  ]) { const [a, l] = parity(s); check(a === l, `1.2 ${label} iguais (${a.slice(0, 12)} / ${l.slice(0, 12)})`); }
  await lp0.reload({ waitUntil: 'networkidle' });
  check(await lp0.locator('input[name=email]').isVisible(), '1.3 login disponível no local depois da sincronização');

  // ---------- 2. login no local com a mesma palavra-passe do central ----------
  const lp = await login(lctx, L);
  await lp.goto(L + '/admin/pedidos', { waitUntil: 'networkidle' });
  check(await waitFor(() => lp.locator('[data-testid="sync-status"][data-online="1"]').isVisible(), 15000), '2.1 painel local mostra "Servidor local · sincronizado"');
  const cctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const cp = await login(cctx, C);
  await cp.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  check(await waitFor(() => cp.locator('[data-testid="sync-status"]').innerText().then((t) => /Servidor do restaurante ligado/.test(t)), 15000), '2.2 painel central mostra "Servidor do restaurante ligado"');

  // ---------- 3. catálogo só de leitura no local ----------
  const before = lq("select available from menu_items where name = 'Moelas'");
  await lp.goto(L + '/admin/menu', { waitUntil: 'networkidle' });
  const moelas = lp.locator('li').filter({ hasText: 'Moelas' }).filter({ has: lp.locator('input[type=checkbox]') }).first();
  check(await lp.locator('[data-testid="local-readonly"]').isVisible(), '3.0 aviso "só se altera no site central" no menu do local');
  check(await moelas.locator('label:has-text("Disponível") input').isDisabled(), '3.0b controlos do menu desativados no local');
  await moelas.locator('label:has-text("Disponível") input').click({ force: true, timeout: 2000 }).catch(() => {});
  await sleep(1500);
  check(lq("select available from menu_items where name = 'Moelas'") === before && cq("select available from menu_items where name = 'Moelas'") === 't', '3.1 servidor local não altera o menu (fonte é o central)');
  await lp.goto(L + '/admin/qr', { waitUntil: 'networkidle' });
  check((await lp.content()).includes('http://localhost:3100/m/'), '3.2 QR Codes no local apontam para o site central');

  // ---------- 4. pedido no servidor local → painel local de imediato → central ----------
  const tok2 = cq('select qr_token from dining_tables where number = 2');
  const tok4 = cq('select qr_token from dining_tables where number = 4');
  const frango = Number(cq("select id from menu_items where name = 'Frango Churrasco'"));
  await lp.goto(L + '/admin/pedidos', { waitUntil: 'networkidle' });
  const lo = await order(L, tok2, frango, 2);
  check(lo.status === 200 && lo.body.origin === 'local', `4.1 pedido criado no local (${lo.body.origin} ${lo.body.number})`);
  const ok42 = await waitFor(() => lp.locator(`[data-testid="order-L${lo.body.number}"]`).isVisible(), 10000);
  if (!ok42) console.log('DIAG 4.2', lo.body.number, 'cartões:', await lp.$$eval('article[data-testid^="order-"]', (a) => a.map((x) => x.dataset.testid).join(',')), '| estado ligação:', await lp.locator('header').innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 200)));
  check(ok42, '4.2 aparece logo no painel do local (sem internet necessária)');
  check(await waitFor(() => cq(`select origin||number from orders where id = '${lo.body.orderId}'`) === `local${lo.body.number}`, 15000), '4.3 chegou ao central com o mesmo id e número L');
  check(await waitFor(() => cp.locator(`[data-testid="order-L${lo.body.number}"]`).isVisible(), 15000), '4.4 aparece no painel central como L…');

  // ---------- 5. pedido no central (cliente com internet) → painel do restaurante ----------
  const co = await order(C, tok4, frango, 1);
  check(co.body.origin === 'central', '5.1 pedido criado no central');
  check(await waitFor(() => lp.locator(`[data-testid="order-${co.body.number}"]`).isVisible(), 15000), '5.2 aparece no painel do servidor local');

  // ---------- 6. estados nos dois sentidos ----------
  await lp.locator(`[data-testid="order-L${lo.body.number}"]`).getByRole('button', { name: 'Iniciar preparação' }).click();
  check(await waitFor(() => cq(`select status from orders where id = '${lo.body.orderId}'`) === 'preparing', 15000), '6.1 estado mudado no local chega ao central');
  await cp.reload({ waitUntil: 'networkidle' });
  await cp.locator(`[data-testid="order-${co.body.number}"]`).getByRole('button', { name: 'Iniciar preparação' }).click();
  check(await waitFor(() => lq(`select status from orders where id = '${co.body.orderId}'`) === 'preparing', 15000), '6.2 estado mudado no central chega ao local');
  check(await waitFor(() => lp.locator(`[data-testid="order-${co.body.number}"][data-status="preparing"]`).isVisible(), 15000), '6.3 painel local atualiza sozinho');

  // ---------- 7. SEM INTERNET: o restaurante continua; nada se perde nem duplica ----------
  srv('stop-central');
  check(await waitFor(() => lp.locator('[data-testid="sync-status"][data-online="0"]').isVisible(), 20000), '7.1 painel local indica "sem internet"');
  check(await waitFor(() => lp.locator('[data-testid="local-offline"]').isVisible(), 10000), '7.2 aviso "O restaurante continua a funcionar neste servidor local"');
  const toks = ['1', '2', '3', '5', '6'].map((nr) => cq(`select qr_token from dining_tables where number = ${nr}`));
  const burst = await Promise.all(Array.from({ length: 25 }, (_, i) => order(L, toks[i % 5], frango, 1 + (i % 3))));
  check(burst.every((r) => r.status === 200), `7.3 25 pedidos simultâneos aceites pelo local sem internet (${burst.filter((r) => r.status === 200).length}/25)`);
  const nums = burst.map((r) => r.body.number);
  check(new Set(nums).size === 25, '7.4 25 números L diferentes');
  // repetição de envio com a mesma chave (telemóvel a reenviar)
  const again = await order(L, toks[0], frango, 1, burst[0].key);
  check(again.body.duplicate === true && again.body.orderId === burst[0].body.orderId, '7.5 reenvio com a mesma chave devolve o mesmo pedido');
  await lp.locator(`[data-testid="order-L${lo.body.number}"]`).getByRole('button', { name: 'Marcar concluído' }).click();
  await sleep(1500);
  check(await waitFor(() => lp.locator('[data-testid="sync-status"]').getAttribute('data-pending').then((v) => Number(v) >= 26), 10000), '7.6 painel mostra os pedidos por enviar');
  check(await waitFor(() => lp.locator(`[data-testid="order-L${burst[24].body.number}"]`).isVisible(), 10000), '7.7 pedidos feitos sem internet aparecem no painel local');

  // chamada feita no servidor local SEM internet
  const callL = await (await fetch(`${L}/api/chamadas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: toks[3], kind: 'bill', key: key() }) })).json();
  check(callL.ok === true && lq(`select origin from service_calls where id = '${callL.call.id}'`) === 'local', '7.8 chamada aceite pelo servidor local sem internet');
  // ---------- 8. internet volta: tudo sincroniza sozinho, sem duplicados ----------
  srv('central');
  check(await waitFor(() => lq('select count(*) from orders where needs_push') === '0', 30000), '8.1 fila do local esvaziou');
  const ids = burst.map((r) => `'${r.body.orderId}'`).join(',');
  check(cq(`select count(*) from orders where id in (${ids})`) === '25', '8.2 os 25 pedidos chegaram ao central');
  check(cq(`select count(*) from (select idempotency_key from orders group by 1 having count(*) > 1) x`) === '0', '8.3 nenhum pedido duplicado no central');
  check(cq(`select sum(total) from orders where id in (${ids})`) === lq(`select sum(total) from orders where id in (${ids})`), '8.4 totais iguais nos dois servidores');
  check(cq(`select status from orders where id = '${lo.body.orderId}'`) === 'done', '8.5 mudança de estado feita sem internet chegou ao central');
  check(await waitFor(() => lp.locator('[data-testid="sync-status"][data-online="1"]').isVisible(), 15000), '8.6 painel volta a "sincronizado"');

  check(await waitFor(() => cq(`select origin||':'||kind from service_calls where id = '${callL.call.id}'`) === 'local:bill', 20000), '8.7 chamada feita sem internet chegou ao central');
  // ---------- 13. Etapa 3: garçons e chamadas entre o central e o servidor local ----------
  cq("delete from service_calls");
  cq("update dining_tables set waiter_id = null where number in (3,4,5)");
  cq("delete from admin_users where email = 'sync-garcom@nokau.test'");
  cq("insert into admin_users (email, password_hash, role, name) select 'sync-garcom@nokau.test', password_hash, 'garcom', 'Djenabu' from admin_users where email = 'gerente@nokau.test'");
  cq("update dining_tables set waiter_id = (select id from admin_users where email = 'sync-garcom@nokau.test') where number = 3");
  check(await waitFor(() => lq("select coalesce(w.name,'') from dining_tables t left join admin_users w on w.id = t.waiter_id where t.number = 3") === 'Djenabu', 20000), '13.1 garçom e atribuição de mesa chegam ao servidor local');
  const callC = await (await fetch(`${C}/api/chamadas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: cq('select qr_token from dining_tables where number = 4'), kind: 'waiter', key: key() }) })).json();
  check(await waitFor(() => lq(`select status from service_calls where id = '${callC.call.id}'`) === 'open', 15000), '13.2 chamada de cliente (central) chega ao servidor local');
  await lp.goto(L + '/admin/mesas', { waitUntil: 'networkidle' });
  check(await waitFor(() => lp.locator(`[data-testid="call-${callC.call.id}"]`).isVisible(), 10000), '13.3 aparece no painel de mesas do local');
  await lp.locator(`[data-testid="call-${callC.call.id}"]`).getByRole('button', { name: 'A caminho' }).click();
  check(await waitFor(() => cq(`select status from service_calls where id = '${callC.call.id}'`) === 'ack', 15000), '13.4 "A caminho" no local chega ao central (o cliente vê)');
  // ---------- 9. reenviar tudo outra vez (falha a meio, resposta perdida) não duplica ----------
  const cBefore = cq('select count(*) from orders');
  lq('update orders set needs_push = true');
  check(await waitFor(() => lq('select count(*) from orders where needs_push') === '0', 30000), '9.1 reenvio total processado');
  check(cq('select count(*) from orders') === cBefore, `9.2 central continua com ${cBefore} pedidos (nada duplicado)`);
  // pedido inválido na fila (sem produtos): é recusado e NÃO bloqueia os outros
  const tid1 = lq('select id from dining_tables where number = 1');
  lq(`insert into orders (id, table_id, total, idempotency_key, origin, number, needs_push, created_at) values ('00000000-0000-4000-8000-000000000001', ${tid1}, 0, 'synctestpoison000001', 'local', 900001, true, now() - interval '1 day')`);
  const good = await order(L, cq('select qr_token from dining_tables where number = 8'), frango, 1);
  check(await waitFor(() => cq(`select count(*) from orders where id = '${good.body.orderId}'`) === '1', 20000), '9.3 pedido inválido na fila não bloqueia os seguintes');
  check(await waitFor(() => lq("select needs_push from orders where id = '00000000-0000-4000-8000-000000000001'") === 'f', 15000), '9.4 pedido inválido deixa de ser reenviado');
  check(lq("select count(*) from audit_log where action = 'sync.rejected' and entity_id = '00000000-0000-4000-8000-000000000001'") === '1', '9.5 recusa registada na Atividade');
  check(await waitFor(() => lp.locator('[data-testid="sync-status"]').innerText().then((t) => /recusado/.test(t)), 15000), '9.6 painel local mostra "recusado(s) pelo central"');
  check(cq("select count(*) from orders where id = '00000000-0000-4000-8000-000000000001'") === '0', '9.7 central não gravou o pedido inválido');

  // ---------- 10. conflito: vence a alteração mais recente ----------
  const x = burst[1].body.orderId;
  cq(`update orders set status = 'preparing', status_changed_at = now() where id = '${x}'`); // gerente no central, agora
  lq(`update orders set status = 'done', status_changed_at = now() - interval '5 minutes', needs_push = true where id = '${x}'`); // alteração antiga no local
  check(await waitFor(() => lq(`select status from orders where id = '${x}'`) === 'preparing', 20000), '10.1 alteração mais antiga do local não apaga a mais recente do central');
  check(cq(`select status from orders where id = '${x}'`) === 'preparing', '10.2 central mantém a mais recente');

  // ---------- 11. o local nunca reutiliza números (base local recriada) ----------
  srv('stop-local');
  const maxL = Number(cq("select max(number) from orders where origin = 'local'"));
  q('postgres', 'drop database if exists nokau_local'); q('postgres', 'create database nokau_local');
  srv('local');
  check(await waitFor(() => lq("select count(*) from admin_users") === cq("select count(*) from admin_users"), 30000), '11.1 local recriado sincroniza de novo');
  const nr = await order(L, tok2, frango, 1);
  check(nr.body.number > maxL, `11.2 numeração continua depois de L${maxL} (novo: L${nr.body.number})`);
  check(await waitFor(() => cq(`select count(*) from orders where id = '${nr.body.orderId}'`) === '1', 15000), '11.3 e chega ao central sem conflito');
  check(await waitFor(() => lq(`select count(*) from orders where id = '${burst[3].body.orderId}'`) === '1', 20000), '11.4 histórico do central volta ao local');
  // regressão: depois de receber centenas de pedidos de uma vez, um pedido novo aparece logo no painel (antes: só ~20 s depois)
  const synced = Number(lq('select count(*) from orders'));
  // base local recriada = sessões locais apagadas (ficam no servidor): o painel pede login outra vez
  await lp.goto(L + '/admin/pedidos', { waitUntil: 'networkidle' });
  check(/\/admin\/login/.test(lp.url()), '11.4b base local recriada: as sessões antigas deixam de valer (pede login)');
  await lp.fill('input[name=email]', 'gerente@nokau.test'); await lp.fill('input[name=password]', 'senha-forte-123'); await lp.click('button[type=submit]');
  await lp.waitForURL('**/admin/dashboard', { timeout: 20000 });
  await lp.goto(L + '/admin/pedidos', { waitUntil: 'networkidle' });
  await lp.waitForSelector('text=Ao vivo', { timeout: 15000 });
  const nr2 = await order(L, cq('select qr_token from dining_tables where number = 7'), frango, 1);
  const t0 = Date.now();
  const shown = await waitFor(() => lp.locator(`[data-testid="order-L${nr2.body.number}"]`).isVisible(), 8000, 200);
  check(synced > 200 && shown, `11.5 com ${synced} pedidos acabados de sincronizar, o pedido novo aparece no painel em ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // ---------- 14. Etapa 4: pagamentos entre o servidor local e o central ----------
  const T9 = cq('select qr_token from dining_tables where number = 9'), tid9 = cq('select id from dining_tables where number = 9');
  cq(`update orders set is_test = true where table_id = ${tid9} and payment_id is null`); lq(`update orders set is_test = true where table_id = ${tid9} and payment_id is null`);
  cq(`update orders set created_at = created_at - interval '1 hour' where table_id = ${tid9} and created_at > now() - interval '15 minutes'`);
  lq(`update orders set created_at = created_at - interval '1 hour' where table_id = ${tid9} and created_at > now() - interval '15 minutes'`);
  async function payOnPanel(page, base, methodLabel) {
    await page.goto(base + '/admin/mesas', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Todas' }).click().catch(() => {});
    await page.locator('[data-testid="table-9"]').click();
    await page.waitForSelector('[data-testid="table-bill"]', { timeout: 15000 });
    await page.locator('[data-testid="table-bill"] label', { hasText: methodLabel }).click();
    await page.locator('[data-testid="bill-confirm"]').click();
    await page.waitForSelector('[data-testid="bill-paid"]', { timeout: 15000 });
  }
  const po = await order(L, T9, frango, 2);
  await waitFor(() => cq(`select count(*) from orders where id = '${po.body.orderId}'`) === '1', 15000);
  await payOnPanel(lp, L, 'Pagamento à mão');
  const lpay = lq(`select payment_id from orders where id = '${po.body.orderId}'`);
  check(!!lpay && lq(`select origin from payments where id = '${lpay}'`) === 'local', '14.1 pagamento confirmado no servidor local');
  check(await waitFor(() => cq(`select coalesce(payment_id::text,'') from orders where id = '${po.body.orderId}'`) === lpay, 20000), '14.2 pagamento chega ao central e o pedido fica pago lá');
  check(cq(`select amount||':'||method from payments where id = '${lpay}'`) === '12000:cash', '14.3 valor e método iguais no central (12 000, numerário)');
  // anular no central → o local fica a saber
  await cp.goto(C + '/admin/pagamentos', { waitUntil: 'load' });
  const prow = cp.locator(`[data-testid="payment-${lpay}"]`);
  await prow.getByRole('button', { name: 'Anular…' }).click();
  await prow.locator('input').fill('Teste de anulação no central');
  await prow.getByRole('button', { name: 'Confirmar anulação' }).click();
  check(await waitFor(() => lq(`select status from payments where id = '${lpay}'`) === 'voided', 20000), '14.4 anulação feita no central chega ao local');
  check(lq(`select coalesce(payment_id::text,'null') from orders where id = '${po.body.orderId}'`) === 'null', '14.5 no local o pedido volta a ficar por pagar');
  // CONFLITO: o mesmo pedido cobrado nos dois lados sem internet
  const co2 = await order(C, T9, frango, 1);
  await waitFor(() => lq(`select count(*) from orders where id = '${co2.body.orderId}'`) === '1', 15000);
  lq(`update orders set is_test = true where id = '${po.body.orderId}'`); cq(`update orders set is_test = true where id = '${po.body.orderId}'`);
  srv('stop-central');
  await waitFor(() => lp.locator('[data-testid="sync-status"][data-online="0"]').isVisible(), 20000);
  await payOnPanel(lp, L, 'Orange Money'); // gerente no restaurante, sem internet
  // … e outro gerente cobrou o mesmo pedido no site central (simulado diretamente na base do central)
  cq(`insert into payments (table_id, amount, method, received_by, idempotency_key) values (${tid9}, 6000, 'card', 'outro-gerente@nokau.test', 'synctestconflict${Date.now()}')`);
  cq(`update orders set payment_id = (select id from payments where received_by = 'outro-gerente@nokau.test' order by created_at desc limit 1) where id = '${co2.body.orderId}'`);
  srv('central');
  const lpay2 = lq(`select payment_id from orders where id = '${co2.body.orderId}'`);
  check(await waitFor(() => lq(`select needs_push from payments where id = '${lpay2}'`) === 'f', 30000), '14.6 pagamento do local processado pelo central quando a internet voltou');
  check(cq(`select count(*) from payments where id = '${lpay2}'`) === '0', '14.7 conflito: o central NÃO regista o segundo pagamento do mesmo pedido');
  check(Number(cq(`select count(*) from audit_log where action = 'sync.payment_conflict' and entity_id = '${lpay2}'`)) === 1, '14.8 conflito registado na Atividade do central (para o gerente rever)');
  check(await waitFor(() => lp.locator('[data-testid="sync-status"]').innerText().then((t) => /recusado/.test(t)), 15000), '14.9 painel local avisa "recusado(s) pelo central"');
  cq(`update orders set is_test = true where id = '${co2.body.orderId}'`);

  // ---------- 15. Reservas: site (central) ↔ restaurante (servidor local) ----------
  const RR = String(Date.now()).slice(-6);
  const dayP = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  async function reserveOn(base, email, n) {
    const pg = await (await b.newContext()).newPage();
    await pg.goto(base + '/reservas', { waitUntil: 'load' });
    const f = pg.locator('form').filter({ has: pg.locator('input[name=guests]') });
    await f.locator('input[name=name]').fill('Reserva Sync'); await f.locator('input[name=phone]').fill(`97${RR}${n}`); await f.locator('input[name=email]').fill(email);
    await f.locator('input[name=date]').fill(dayP(3 + n)); await f.locator('input[name=time]').fill('20:00'); await f.locator('input[name=guests]').fill('4');
    await f.getByRole('button', { name: 'Pedir reserva' }).click();
    await pg.waitForURL(/\/reserva\//, { timeout: 15000, waitUntil: 'commit' });
    return pg;
  }
  const cpg = await reserveOn(C, `sync1-${RR}@exemplo.test`, 1);
  const rcode = cq(`select code from reservations where email = 'sync1-${RR}@exemplo.test'`);
  check(await waitFor(() => lq(`select status from reservations where code = '${rcode}'`) === 'pending', 20000), '15.1 reserva feita no site chega ao servidor do restaurante');
  await lp.goto(L + '/admin/reservas', { waitUntil: 'load' });
  const lcard = lp.locator(`[data-testid="reservation-${rcode}"]`);
  check(await waitFor(() => lcard.isVisible(), 15000), '15.2 aparece no painel de reservas do servidor local');
  await lcard.locator('input').fill('Confirmado pelo restaurante');
  await lcard.getByRole('button', { name: 'Aprovar' }).click();
  check(await waitFor(() => cq(`select status from reservations where code = '${rcode}'`) === 'approved', 20000), '15.3 aprovação feita no restaurante chega ao site (central)');
  await cpg.reload({ waitUntil: 'load' });
  check(await waitFor(() => cpg.locator('[data-testid="reservation-page"][data-status="approved"]').isVisible(), 15000), '15.4 o cliente vê "Aprovada" no site');
  // decisão SEM internet no restaurante
  await reserveOn(C, `sync2-${RR}@exemplo.test`, 2);
  const rcode2 = cq(`select code from reservations where email = 'sync2-${RR}@exemplo.test'`);
  await waitFor(() => lq(`select count(*) from reservations where code = '${rcode2}'`) === '1', 20000);
  srv('stop-central');
  await lp.goto(L + '/admin/reservas', { waitUntil: 'load' });
  const lcard2 = lp.locator(`[data-testid="reservation-${rcode2}"]`);
  await waitFor(() => lcard2.isVisible(), 15000);
  await lcard2.getByRole('button', { name: 'Rejeitar' }).click();
  check(await waitFor(() => lq(`select status||':'||needs_push from reservations where code = '${rcode2}'`) === 'rejected:true', 10000), '15.5 rejeitada no restaurante sem internet (fica por enviar)');
  srv('central');
  check(await waitFor(() => cq(`select status from reservations where code = '${rcode2}'`) === 'rejected', 30000), '15.6 quando a internet volta, o site recebe a decisão');

  // ---------- 12. segurança das rotas de sincronização ----------
  const st = async (u, h) => (await fetch(u, { headers: h })).status;
  check(await st(`${C}/api/sync/catalog`) === 401, '12.1 sem token → 401');
  check(await st(`${C}/api/sync/catalog`, { authorization: 'Bearer errado-errado-errado-errado-errado-1' }) === 401, '12.2 token errado → 401');
  check(await st(`${C}/api/sync/orders?after=0`, { authorization: `Bearer ${TOKEN}` }) === 200, '12.3 token certo → 200');
  check(await st(`${L}/api/sync/catalog`, { authorization: `Bearer ${TOKEN}` }) === 404, '12.4 servidor local não expõe as rotas de sincronização');
  const badPost = await fetch(`${C}/api/sync/orders`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ orders: [{ id: 'x', total: -5 }] }) });
  const bp = await badPost.json();
  check(badPost.status === 200 && bp.invalid === 1 && bp.applied.length === 0, '12.5 pedido malformado recusado (validação)');
  check(await st(`${C}/api/admin/sync-status`) === 401, '12.6 estado da sincronização exige sessão');

  await b.close();
  console.log(`OK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
})().catch((e) => { console.log('FATAL', e.message.slice(0, 800)); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
