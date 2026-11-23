/* Etapa 4 — contas de cliente, histórico, pagamentos em mão confirmados pelo gerente, proteção; WhatsApp flutuante. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const B = 'http://localhost:3100';
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sqlErr = (q) => { try { sql(q); return null; } catch (e) { return String(e.stderr || e.message); } };
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
const RUN = Date.now().toString(36);
const C1 = { name: 'Fatumata Baldé', email: `cliente1-${RUN}@nokau.test`, phone: `95${String(Date.now()).slice(-7)}`, pw: 'cliente-senha-1' };
let kn = 0; const key = () => `e4key${RUN}${(kn++).toString().padStart(5, '0')}`;
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message.slice(0, 150)}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${tag}: ${m.text().slice(0, 150)}`); });
};
async function staffLogin(ctx, email, pw, tag) {
  const p = await ctx.newPage(); watch(p, tag);
  await p.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  await p.waitForURL(/\/admin\/(dashboard|mesas)/, { timeout: 20000 }); await p.waitForLoadState('networkidle');
  return p;
}

(async () => {
  sql("update menu_items set available = true, active = true where name in ('Frango Churrasco','Moelas')");
  const tok = (n) => sql(`select qr_token from dining_tables where number = ${n}`);
  const tid = (n) => Number(sql(`select id from dining_tables where number = ${n}`));
  const T = 6; // mesa usada neste teste
  sql(`update orders set is_test = true where table_id = ${tid(T)} and payment_id is null`); // pedidos antigos desta mesa não entram na conta
  sql(`update service_calls set status = 'done' where table_id = ${tid(T)} and status in ('open','ack')`);
  // execuções repetidas do teste: afasta no tempo os pedidos/chamadas anteriores desta mesa (limite de 20 pedidos/mesa/10 min)
  sql(`update orders set created_at = created_at - interval '1 hour' where table_id = ${tid(T)} and created_at > now() - interval '15 minutes'`);
  sql(`update service_calls set created_at = created_at - interval '1 hour' where table_id = ${tid(T)} and created_at > now() - interval '15 minutes'`);
  const frango = Number(sql("select id from menu_items where name = 'Frango Churrasco'")), moelas = Number(sql("select id from menu_items where name = 'Moelas' and category_id = 'entradas'"));
  const b = await chromium.launch();

  // ---------- 1. Registo a partir do menu da mesa ----------
  const cctx = await b.newContext({ ...devices['Pixel 7'] });
  const c = await cctx.newPage(); watch(c, 'cliente');
  await c.goto(`${B}/m/${tok(T)}`, { waitUntil: 'networkidle' });
  await c.locator('[data-testid="client-link"] a', { hasText: 'criar conta' }).click();
  await c.waitForURL(/\/cliente\/registo/);
  const f = c.locator('[data-testid="register-form"]');
  await f.locator('input[name=name]').fill(C1.name); await f.locator('input[name=email]').fill(C1.email);
  await f.locator('input[name=phone]').fill(`${C1.phone.slice(0, 3)} ${C1.phone.slice(3, 6)} ${C1.phone.slice(6)}`);
  await f.locator('input[name=password]').fill(C1.pw); await f.locator('input[name=password2]').fill('outra-senha-xx');
  await f.locator('input[name=consent]').check();
  await f.getByRole('button', { name: 'Criar conta' }).click();
  check(await waitFor(() => c.locator('text=As palavras-passe não coincidem.').isVisible(), 8000), '1.1 palavras-passe diferentes → erro claro');
  check(await f.locator('input[name=email]').inputValue() === C1.email, '1.2 campos preenchidos mantêm-se após o erro');
  await f.locator('input[name=password]').fill(C1.pw); await f.locator('input[name=password2]').fill(C1.pw);
  await f.getByRole('button', { name: 'Criar conta' }).click();
  try { await c.waitForURL(new RegExp(`/m/${tok(T)}`), { timeout: 15000, waitUntil: 'commit' }); }
  catch (e) {
    console.log('DIAG registo | url:', c.url().replace(tok(T), '<tok>'), '| alertas:', JSON.stringify(await c.locator('[role=alert]').allInnerTexts()),
      '| conta criada na BD:', sql(`select count(*) from customers where email = '${C1.email}'`), '| consent:', await f.locator('input[name=consent]').isChecked().catch(() => '?'),
      '| botão:', await f.getByRole('button', { name: /Criar conta|A criar/ }).innerText().catch(() => '?'));
    throw e;
  }
  await c.waitForLoadState('networkidle');
  check(true, '1.3 conta criada → volta ao menu da mesa');
  check(await c.locator('[data-testid="client-link"]').innerText().then((t) => /Olá, Fatumata/.test(t)), '1.4 menu mostra "Olá, Fatumata"');
  check(sql(`select phone from customers where email = '${C1.email}'`) === `+245${C1.phone}`, `1.5 telefone normalizado (+245${C1.phone})`);
  check(/^scrypt\$/.test(sql(`select password_hash from customers where email = '${C1.email}'`)), '1.6 palavra-passe guardada com scrypt (nunca em claro)');
  const dup = await (await b.newContext()).newPage();
  await dup.goto(`${B}/cliente/registo`, { waitUntil: 'networkidle' });
  const df = dup.locator('[data-testid="register-form"]');
  await df.locator('input[name=name]').fill('Outra Pessoa'); await df.locator('input[name=email]').fill(C1.email.toUpperCase()); await df.locator('input[name=phone]').fill('966000111');
  await df.locator('input[name=password]').fill('xxxxxxxx1'); await df.locator('input[name=password2]').fill('xxxxxxxx1'); await df.locator('input[name=consent]').check();
  await df.getByRole('button', { name: 'Criar conta' }).click();
  check(await waitFor(() => dup.locator('text=Já existe uma conta com este email ou telefone').isVisible(), 8000), '1.7 email repetido (maiúsculas) recusado — conta única');

  // ---------- 2. Pedidos ficam na conta ----------
  await c.getByRole('button', { name: 'Adicionar Frango Churrasco', exact: true }).click();
  await c.getByRole('button', { name: /Ver pedido/ }).click();
  await c.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await c.waitForURL(/\/pedido\//, { timeout: 20000 });
  const cid = sql(`select id from customers where email = '${C1.email}'`);
  check(sql(`select count(*) from orders where customer_id = '${cid}'`) === '1', '2.1 pedido associado à conta do cliente');
  // Etapa C: conta obrigatória — sem sessão o pedido é recusado
  const nBefore = sql('select count(*) from orders');
  const anonRes = await fetch(`${B}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok(T), key: key(), lines: [{ itemId: moelas, quantity: 2 }] }) });
  const anon = await anonRes.json();
  check(anonRes.status === 401 && anon.loginRequired === true && sql('select count(*) from orders') === nBefore, '2.2 pedido sem sessão é recusado (401, conta obrigatória) e não cria pedido');
  const AUTH = require('./auth-helper.js');
  const other = await (await fetch(`${B}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(B) }, body: JSON.stringify({ token: tok(T), key: key(), lines: [{ itemId: moelas, quantity: 2 }] }) })).json();
  check(!!other.orderId, '2.2b outra pessoa na mesa (com a sua conta) pede normalmente');
  const forged = await (await fetch(`${B}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(B) }, body: JSON.stringify({ token: tok(T), key: key(), customerId: cid, lines: [{ itemId: moelas, quantity: 1 }] }) })).json();
  check(sql(`select customer_id from orders where id = '${forged.orderId}'`) === AUTH.TEST_CLIENT_ID, '2.3 enviar "customerId" no pedido não muda a conta (identidade só pela sessão)');
  await c.goto(`${B}/cliente`, { waitUntil: 'load' }); await c.waitForSelector('[data-testid="client-profile"]');
  check(await c.locator('[data-testid="client-order"][data-paid="0"]').count() === 1, '2.4 "Os meus pedidos" mostra o pedido como "Por pagar"');
  check(/6\s000 FCFA/.test(await c.locator('[data-testid="unpaid-total"]').innerText()), '2.5 total por pagar: 6 000 FCFA');

  // ---------- 3. Sessão: sair, entrar por telefone, segurança ----------
  await c.getByRole('button', { name: 'Terminar sessão' }).click();
  await c.waitForURL(/\/cliente\/entrar/, { waitUntil: 'commit' }); await c.waitForLoadState('networkidle');
  const lf = c.locator('[data-testid="client-login-form"]');
  await lf.locator('input[name=identifier]').fill(C1.phone); await lf.locator('input[name=password]').fill('errada-errada');
  await lf.getByRole('button', { name: 'Entrar' }).click();
  check(await waitFor(() => c.locator('text=Email/telefone ou palavra-passe incorretos.').isVisible(), 8000), '3.1 palavra-passe errada → mensagem genérica');
  await lf.locator('input[name=password]').fill(C1.pw); await lf.getByRole('button', { name: 'Entrar' }).click();
  await c.waitForURL(/\/cliente$/, { timeout: 15000, waitUntil: 'commit' }); await c.waitForSelector('[data-testid="client-profile"]');
  check(true, '3.2 entra com o telefone (sem indicativo) e a palavra-passe');
  await c.goto(`${B}/admin/dashboard`, { waitUntil: 'networkidle' });
  check(/\/admin\/login/.test(c.url()), '3.3 sessão de cliente NÃO dá acesso ao painel');
  const ck = (await cctx.cookies()).find((x) => x.name === 'nk_client');
  const ctx2 = await b.newContext(); await ctx2.addCookies([{ ...ck, value: ck.value.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A')) }]);
  const p2 = await ctx2.newPage(); await p2.goto(`${B}/cliente`, { waitUntil: 'networkidle' });
  check(/\/cliente\/entrar/.test(p2.url()), '3.4 cookie adulterado → sem sessão');
  const ev = await (await b.newContext()).newPage();
  await ev.goto(`${B}/cliente/entrar?volta=https://exemplo-malicioso.com`, { waitUntil: 'networkidle' });
  await ev.locator('input[name=identifier]').fill(C1.email); await ev.locator('input[name=password]').fill(C1.pw); await ev.getByRole('button', { name: 'Entrar' }).click();
  await ev.waitForURL(/localhost:3100\/cliente$/, { timeout: 15000 }).catch(() => {});
  check(new URL(ev.url()).host === 'localhost:3100', '3.5 sem redirecionamento para sites externos após o login');

  // ---------- 4. Conta da mesa: garçom vê, só o gerente confirma ----------
  await fetch(`${B}/api/chamadas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok(T), kind: 'bill', key: key() }) });
  const actx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const ap = await staffLogin(actx, 'gerente@nokau.test', 'senha-forte-123', 'gerente');
  await ap.goto(B + '/admin/mesas', { waitUntil: 'networkidle' });
  await ap.getByRole('button', { name: 'Todas' }).click().catch(() => {});
  await ap.locator(`[data-testid="table-${T}"]`).click();
  await ap.waitForSelector('[data-testid="table-bill"]');
  const expected = Number(sql(`select sum(total) from orders where table_id = ${tid(T)} and payment_id is null and not is_test`));
  check((await ap.locator('[data-testid="bill-total"]').innerText()).replace(/\D/g, '') === String(expected), `4.1 conta da mesa = soma dos pedidos por pagar (${expected} FCFA)`);
  // garçom
  const w = sql("select email from admin_users where role = 'garcom' and active limit 1");
  if (w) {
    sql(`update admin_users set password_hash = (select password_hash from admin_users where email = 'gerente@nokau.test') where email = '${w}'`);
    const gctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const g = await staffLogin(gctx, w, 'senha-forte-123', 'garcom');
    await g.getByRole('button', { name: 'Todas' }).click();
    await g.locator(`[data-testid="table-${T}"]`).click();
    await g.waitForSelector('[data-testid="table-bill"]');
    check(await g.locator('[data-testid="bill-confirm"]').count() === 0 && await g.locator('text=O pagamento é confirmado pelo gerente.').isVisible(), '4.2 garçom vê a conta mas não confirma pagamentos');
    await g.goto(B + '/admin/pagamentos', { waitUntil: 'networkidle' });
    check(/\/admin\/mesas/.test(g.url()), '4.3 garçom sem acesso à página de pagamentos');
  }
  // numerário com troco
  await ap.locator('[data-testid="table-bill"] label', { hasText: 'Pagamento à mão' }).click();
  await ap.locator('[data-testid="bill-tendered"]').fill(String(expected - 500));
  check(/Faltam/.test(await ap.locator('[data-testid="bill-change"]').innerText()) && await ap.locator('[data-testid="bill-confirm"]').isDisabled(), '4.4 valor entregue insuficiente → "Faltam …" e não deixa confirmar');
  await ap.locator('[data-testid="bill-tendered"]').fill(String(expected + 1500));
  check(/Troco: 1\s500 FCFA/.test(await ap.locator('[data-testid="bill-change"]').innerText()), '4.5 troco calculado (1 500 FCFA)');
  // dois gerentes a cobrar a mesma conta ao mesmo tempo
  const a2 = await actx.newPage(); watch(a2, 'gerente2'); // mesma sessão de gerente, outro ecrã
  await a2.goto(B + '/admin/mesas', { waitUntil: 'networkidle' });
  await a2.getByRole('button', { name: 'Todas' }).click().catch(() => {});
  await a2.locator(`[data-testid="table-${T}"]`).click(); await a2.waitForSelector('[data-testid="table-bill"]');
  await a2.locator('[data-testid="table-bill"] label', { hasText: 'Orange Money' }).click();
  const before = Number(sql(`select count(*) from payments where table_id = ${tid(T)}`));
  await Promise.all([ap.locator('[data-testid="bill-confirm"]').click(), a2.locator('[data-testid="bill-confirm"]').click()]);
  await sleep(3000);
  check(Number(sql(`select count(*) from payments where table_id = ${tid(T)}`)) === before + 1, '4.6 dois gerentes ao mesmo tempo → só UM pagamento registado');
  const pay = sql(`select id||'|'||amount||'|'||method||'|'||coalesce(tendered::text,'')||'|'||received_by from payments where table_id = ${tid(T)} order by created_at desc limit 1`).split('|');
  check(Number(pay[1]) === expected, `4.7 valor registado = calculado no servidor (${pay[1]})`);
  check(pay[4] === 'gerente@nokau.test', `4.8 registado quem recebeu (${pay[4]})`);
  check(sql(`select count(*) from orders where table_id = ${tid(T)} and payment_id is null and not is_test`) === '0', '4.9 todos os pedidos da mesa ficaram pagos');
  check(sql(`select status from service_calls where table_id = ${tid(T)} and kind = 'bill' order by created_at desc limit 1`) === 'done', '4.10 o pedido de conta da mesa ficou resolvido');
  const loser = (await ap.locator('[data-testid="table-bill"] [role="alert"]').count()) + (await a2.locator('[data-testid="table-bill"] [role="alert"]').count());
  const winnerMsg = (await ap.locator('[data-testid="bill-paid"]').count()) + (await a2.locator('[data-testid="bill-paid"]').count());
  check(winnerMsg >= 1, `4.11 quem confirmou vê "Pagamento … confirmado" (${winnerMsg} ecrã(s); recusado em ${loser})`);
  await ap.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' });
  check(await ap.locator('[data-testid="order-paid"]').first().isVisible(), '4.12 pedidos aparecem como "Pago" no painel');

  // ---------- 5. Proteção contra alterações não autorizadas ----------
  check(/não pode ser alterado/.test(sqlErr(`update payments set amount = 1 where id = '${pay[0]}'`) ?? ''), '5.1 base de dados recusa alterar o valor de um pagamento');
  check(/não podem ser apagados/.test(sqlErr(`delete from payments where id = '${pay[0]}'`) ?? ''), '5.2 base de dados recusa apagar um pagamento');
  // repetir a ação de confirmar (mesmos pedidos) → recusada
  let cap = null; ap.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action'] && /mesas/.test(r.url())) cap = { url: r.url(), headers: r.headers(), body: r.postData() }; });
  const extra = await (await fetch(`${B}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(B) }, body: JSON.stringify({ token: tok(T), key: key(), lines: [{ itemId: moelas, quantity: 1 }] }) })).json();
  await ap.goto(B + '/admin/mesas', { waitUntil: 'networkidle' });
  await ap.getByRole('button', { name: 'Todas' }).click().catch(() => {});
  await ap.locator(`[data-testid="table-${T}"]`).click(); await ap.waitForSelector('[data-testid="table-bill"]');
  await ap.locator('[data-testid="table-bill"] label', { hasText: 'Telecel' }).click();
  await ap.locator('[data-testid="bill-confirm"]').click(); await sleep(2500);
  const nPay = sql(`select count(*) from payments where table_id = ${tid(T)}`);
  if (cap) {
    const body = cap.body.replace(/"key":"[^"]+"/, `"key":"${key()}"`); // outra chave: tentativa de cobrar de novo
    await actx.request.post(cap.url, { headers: { 'content-type': cap.headers['content-type'], 'next-action': cap.headers['next-action'], accept: 'text/x-component' }, data: body });
    check(sql(`select count(*) from payments where table_id = ${tid(T)}`) === nPay, '5.3 cobrar outra vez pedidos já pagos é recusado no servidor');
    const g2ctx = await b.newContext();
    if (w) {
      const g2 = await staffLogin(g2ctx, w, 'senha-forte-123', 'garcom2');
      void g2;
      sql(`update orders set payment_id = null where id = '${extra.orderId}'`) ; // simula pedido por pagar (só para este teste)
      await g2ctx.request.post(cap.url, { headers: { 'content-type': cap.headers['content-type'], 'next-action': cap.headers['next-action'], accept: 'text/x-component' }, data: cap.body.replace(/"key":"[^"]+"/, `"key":"${key()}"`) });
      check(sql(`select coalesce(payment_id::text,'null') from orders where id = '${extra.orderId}'`) === 'null', '5.4 garçom não consegue confirmar pagamentos (ação repetida no servidor)');
      sql(`update orders set is_test = true where id = '${extra.orderId}'`);
    }
  } else bad.push('5.3 não foi possível capturar a ação de pagamento');

  // ---------- 6. Página de pagamentos e anulação com motivo ----------
  await ap.goto(B + '/admin/pagamentos', { waitUntil: 'networkidle' });
  check(await ap.locator(`[data-testid="payment-${pay[0]}"]`).isVisible(), '6.1 pagamento aparece na lista com mesa, método e quem recebeu');
  check(/FCFA/.test(await ap.locator('[data-testid="payments-total"]').innerText()), '6.2 total recebido e totais por método');
  const row = ap.locator(`[data-testid="payment-${pay[0]}"]`);
  await row.getByRole('button', { name: 'Anular…' }).click();
  check(await row.getByRole('button', { name: 'Confirmar anulação' }).isDisabled(), '6.3 anular exige motivo');
  await row.locator('input').fill('Cobrado na mesa errada');
  await row.getByRole('button', { name: 'Confirmar anulação' }).click();
  check(await waitFor(() => sql(`select status from payments where id = '${pay[0]}'`) === 'voided', 8000), '6.4 pagamento anulado (não apagado)');
  check(sql(`select void_reason||'|'||voided_by from payments where id = '${pay[0]}'`) === 'Cobrado na mesa errada|gerente@nokau.test', '6.5 motivo e quem anulou registados');
  check(sql(`select count(*) from orders where payment_id = '${pay[0]}'`) === '0', '6.6 pedidos voltam a ficar por pagar');
  check(/voltar a ser confirmado/.test(sqlErr(`update payments set status = 'confirmed' where id = '${pay[0]}'`) ?? ''), '6.7 anulado nunca volta a confirmado');
  check(Number(sql(`select count(*) from audit_log where entity = 'payment' and entity_id = '${pay[0]}' and action in ('payment.confirm','payment.void')`)) === 2, '6.8 confirmação e anulação na Atividade');
  await c.goto(`${B}/cliente`, { waitUntil: 'load' }); await c.waitForSelector('[data-testid="client-profile"]');
  check(await c.locator('[data-testid="client-order"][data-paid="0"]').count() === 1, '6.9 cliente volta a ver o pedido "Por pagar"');

  // pagamento final (para o cliente ver "Pago")
  await ap.goto(B + '/admin/mesas', { waitUntil: 'networkidle' });
  await ap.getByRole('button', { name: 'Todas' }).click().catch(() => {});
  await ap.locator(`[data-testid="table-${T}"]`).click(); await ap.waitForSelector('[data-testid="table-bill"]');
  await ap.locator('[data-testid="table-bill"] label', { hasText: 'Telecel' }).click();
  await ap.locator('[data-testid="bill-confirm"]').click();
  await waitFor(() => ap.locator('[data-testid="bill-paid"]').isVisible(), 8000);
  await c.reload({ waitUntil: 'load' }); await c.waitForSelector('[data-testid="client-profile"]');
  check(/pago · telecel/i.test(await c.locator('[data-testid="client-order"]').first().innerText()), '6.10 cliente vê "Pago · Telecel" no histórico');

  // ---------- 7. Clientes (gestão) ----------
  await ap.goto(B + '/admin/clientes', { waitUntil: 'networkidle' });
  check(await ap.locator('[data-testid="clientes"]').getByText(C1.email).isVisible(), '7.1 página Clientes lista o cliente');

  // ---------- 8. WhatsApp flutuante ----------
  const site = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await site.goto(B + '/', { waitUntil: 'networkidle' });
  const wa = site.locator('[data-testid="whatsapp-float"]');
  check(await wa.isVisible(), '8.1 botão do WhatsApp visível no site');
  check((await wa.getAttribute('href')).startsWith('https://wa.me/245957616701?text='), '8.2 abre o WhatsApp do restaurante com mensagem');
  check(await wa.getAttribute('rel') === 'noopener noreferrer', '8.3 abre em segurança (noopener)');
  const bb = await wa.boundingBox(), bar = await site.locator('nav[aria-label] >> nth=-1').boundingBox().catch(() => null);
  const barBox = await site.evaluate(() => { const n = [...document.querySelectorAll('div,nav')].find((e) => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().bottom >= innerHeight - 1 && e.getBoundingClientRect().height < 100); const r = n?.getBoundingClientRect(); return r ? { y: r.y } : null; });
  void bar;
  check(!barBox || bb.y + bb.height <= barBox.y, '8.4 no telemóvel não tapa a barra Ligar/Reservar/Direções');
  await site.goto(`${B}/m/${tok(T)}`, { waitUntil: 'networkidle' });
  check(await site.locator('[data-testid="whatsapp-float"]').count() === 0, '8.5 não aparece no menu da mesa (não compete com pedidos/ajuda)');
  const nojs = await (await b.newContext({ javaScriptEnabled: false })).newPage();
  await nojs.goto(B + '/', { waitUntil: 'load' });
  check(await nojs.locator('[data-testid="whatsapp-float"]').isVisible(), '8.6 funciona sem JavaScript');

  await b.close();
  console.log(`OK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
})().catch((e) => { console.log('FATAL', e.message.slice(0, 900)); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
