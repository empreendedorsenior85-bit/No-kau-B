/* Etapa 3 — atendimento: chamadas do cliente, painel de mesas em tempo real, garçons, atribuição, permissões, histórico. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const B = 'http://localhost:3100';
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
const W1 = { email: 'garcom1@nokau.test', name: 'Aissatu', pw: 'garcom-senha-111' }, W2 = { email: 'garcom2@nokau.test', name: 'Braima', pw: 'garcom-senha-222' };
let kn = 0; const key = () => `e3key${Date.now().toString(36)}${(kn++).toString().padStart(6, '0')}`;
// Etapa C: pedidos exigem conta — as chamadas à API vão com a sessão do cliente de teste
const api = async (path, body, method = 'POST') => { const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(path === '/api/pedidos' ? { cookie: require('./auth-helper.js').clientCookie(B) } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };

async function login(ctx, email, pw, tag) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message.slice(0, 150)}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR/.test(m.text())) errs.push(`${tag}: ${m.text().slice(0, 150)}`); });
  await p.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  await p.waitForURL(/\/admin\/(dashboard|mesas)/, { timeout: 20000 });
  return p;
}

(async () => {
  // limpeza de execuções anteriores
  sql("delete from service_calls");
  sql("update dining_tables set waiter_id = null");
  sql("delete from admin_users where email like 'garcom%@nokau.test'");
  sql("update menu_items set available = true, active = true where name in ('Frango Churrasco','Moelas')");
  const tok = (n) => sql(`select qr_token from dining_tables where number = ${n}`);
  const tid = (n) => Number(sql(`select id from dining_tables where number = ${n}`));
  sql(`delete from orders where table_id in (${tid(1)}, ${tid(2)})`);
  const b = await chromium.launch();

  // ---------- 1. Admin cria garçons e atribui mesas ----------
  const actx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const ap = await login(actx, 'gerente@nokau.test', 'senha-forte-123', 'admin');
  await ap.goto(B + '/admin/garcons', { waitUntil: 'networkidle' });
  for (const w of [W1, W2]) {
    const f = ap.locator('[data-testid="new-waiter"]');
    await f.locator('input[name=name]').fill(w.name); await f.locator('input[name=email]').fill(w.email); await f.locator('input[name=password]').fill(w.pw);
    await f.getByRole('button', { name: 'Criar garçom' }).click();
    await ap.waitForSelector(`[data-testid="waiter-${w.email}"]`, { timeout: 15000 });
  }
  check(sql("select string_agg(name||':'||role, ',' order by name) from admin_users where email like 'garcom%@nokau.test'") === 'Aissatu:garcom,Braima:garcom', '1.1 dois garçons criados (perfil garçom)');
  const w1id = sql(`select id from admin_users where email = '${W1.email}'`), w2id = sql(`select id from admin_users where email = '${W2.email}'`);
  await ap.locator(`[data-testid="assign-${tid(1)}"]`).selectOption(w1id); await sleep(1200);
  await ap.locator(`[data-testid="assign-${tid(2)}"]`).selectOption(w2id); await sleep(1200);
  check(sql(`select waiter_id from dining_tables where number = 1`) === w1id && sql(`select waiter_id from dining_tables where number = 2`) === w2id, '1.2 Mesa 1 → Aissatu, Mesa 2 → Braima');

  // ---------- 2. Garçom: só atendimento ----------
  const g1ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const g1 = await login(g1ctx, W1.email, W1.pw, 'garcom1');
  await g1.waitForLoadState('networkidle');
  check(/\/admin\/mesas/.test(g1.url()), `2.1 garçom entra direto no painel de mesas (${new URL(g1.url()).pathname})`);
  await g1.waitForSelector('nav[aria-label="Painel"] a', { timeout: 15000 });
  const nav = await g1.locator('nav[aria-label="Painel"] a').allInnerTexts();
  check(nav.map((t) => t.trim()).join('|') === 'Pedidos|Mesas|A minha conta', `2.2 menu do garçom só com Pedidos, Mesas, A minha conta (${nav.join('|')})`);
  for (const path of ['/admin/dashboard', '/admin/menu', '/admin/relatorios', '/admin/garcons', '/admin/atendimento', '/admin/utilizadores', '/admin/qr', '/admin/atividade']) {
    await g1.goto(B + path, { waitUntil: 'networkidle' });
    check(/\/admin\/mesas/.test(g1.url()), `2.3 garçom em ${path} → reencaminhado para as mesas`);
  }
  const csv = await g1ctx.request.get(B + '/admin/relatorios/csv?tipo=pedidos');
  check(csv.status() === 403, `2.4 garçom não exporta relatórios (HTTP ${csv.status()})`);
  // ação de gestão repetida com a sessão do garçom (atribuir mesa) → recusada no servidor
  let cap = null; ap.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action'] && /garcons/.test(r.url())) cap = { url: r.url(), headers: r.headers(), body: r.postData() }; });
  await ap.goto(B + '/admin/garcons', { waitUntil: 'networkidle' });
  await ap.locator(`[data-testid="assign-${tid(3)}"]`).selectOption(w1id); await sleep(1200);
  sql(`update dining_tables set waiter_id = null where number = 3`);
  const rep = await g1ctx.request.post(cap.url, { headers: { 'content-type': cap.headers['content-type'], 'next-action': cap.headers['next-action'], accept: 'text/x-component' }, data: cap.body });
  check(sql(`select coalesce(waiter_id::text,'null') from dining_tables where number = 3`) === 'null', `2.5 garçom NÃO consegue atribuir mesas (ação repetida no servidor, HTTP ${rep.status()})`);
  await g1.goto(B + '/admin/mesas', { waitUntil: 'networkidle' });
  check(await g1.getByRole('button', { name: 'As minhas mesas' }).getAttribute('aria-pressed') === 'true', '2.6 filtro "As minhas mesas" ativo por defeito');
  check(await g1.locator('[data-testid^="table-"][data-tone]').count() === 1 && await g1.locator(`[data-testid="table-1"]`).isVisible(), '2.7 garçom vê a sua mesa (Mesa 1)');
  await g1.getByRole('button', { name: /^🔔 Ativar alertas|Ativar alertas/ }).click().catch(() => {});

  const g2ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const g2 = await login(g2ctx, W2.email, W2.pw, 'garcom2');
  await g2.goto(B + '/admin/mesas', { waitUntil: 'networkidle' });
  await g2.getByRole('button', { name: 'Todas' }).click();
  await ap.goto(B + '/admin/mesas', { waitUntil: 'networkidle' });

  // ---------- 3. Cliente chama o empregado → tempo real ----------
  const cctx = await b.newContext({ ...devices['Pixel 7'] });
  const c = await cctx.newPage();
  c.on('pageerror', (e) => errs.push(`cliente pageerror: ${e.message.slice(0, 150)}`));
  await c.goto(`${B}/m/${tok(1)}`, { waitUntil: 'networkidle' });
  check(await c.locator('[data-testid="table-help"]').isVisible(), '3.1 menu da mesa mostra "Precisa de ajuda?"');
  const t0 = Date.now();
  await c.locator('[data-testid="call-waiter"]').click();
  check(await waitFor(() => c.locator('[data-testid="call-status"][data-kind="waiter"][data-status="open"]').isVisible(), 8000), '3.2 cliente vê "Empregado chamado — o restaurante foi avisado"');
  check(await c.locator('[data-testid="call-waiter"]').isDisabled(), '3.3 botão fica bloqueado enquanto a chamada está ativa (sem duplicar)');
  check(await waitFor(() => g1.locator('[data-testid="calls-waiting"] [data-kind="waiter"][data-status="open"]').isVisible(), 8000), `3.4 garçom da mesa vê a chamada em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  check(await g1.locator('[data-testid="table-1"][data-call="open"]').isVisible(), '3.5 Mesa 1 destacada no painel ("Empregado · há …")');
  check(await waitFor(() => g1.evaluate(() => /CLIENTE A CHAMAR/.test(document.title)), 3000), '3.6 alerta no separador do garçom da mesa');
  await sleep(2000);
  check(!(await g2.evaluate(() => /CLIENTE A CHAMAR/.test(document.title))), '3.7 garçom de OUTRA mesa não é alertado (vê, mas não toca)');
  check(await waitFor(() => g2.locator('[data-testid="table-1"][data-call="open"]').isVisible(), 5000), '3.8 … mas vê a mesa a chamar no painel');
  check(await waitFor(() => ap.locator('[data-testid="calls-waiting"] [data-kind="waiter"]').isVisible(), 5000), '3.9 gestão vê a chamada');
  check(await ap.locator('[data-testid="bell-count"]').isVisible(), '3.10 campainha mostra a chamada');
  const dup = await api('/api/chamadas', { token: tok(1), kind: 'waiter', key: key() });
  check(dup.body?.duplicate === true && sql(`select count(*) from service_calls where table_id = ${tid(1)} and kind = 'waiter'`) === '1', '3.11 segunda chamada do mesmo tipo devolve a mesma (1 na base)');
  check(!('ackBy' in (dup.body?.call ?? {})) && !('tableId' in (dup.body?.call ?? {})), '3.12 cliente não recebe nomes da equipa nem ids internos');

  // ---------- 4. "A caminho" e "Resolvido" ----------
  await g1.locator('[data-testid="calls-waiting"] [data-kind="waiter"]').getByRole('button', { name: 'A caminho' }).click();
  check(await waitFor(() => c.locator('[data-testid="call-status"][data-kind="waiter"][data-status="ack"]').isVisible(), 8000), '4.1 cliente vê "Um empregado está a caminho"');
  check(sql(`select ack_by from service_calls where table_id = ${tid(1)} and kind = 'waiter'`) === 'Aissatu', '4.2 registado quem respondeu (Aissatu)');
  check(await waitFor(() => ap.locator('[data-testid="calls-waiting"] [data-kind="waiter"][data-status="ack"]').isVisible(), 6000), '4.3 gestão vê "A caminho" em tempo real');
  await g1.locator('[data-testid="calls-waiting"] [data-kind="waiter"]').getByRole('button', { name: 'Resolvido' }).click();
  check(await waitFor(() => c.locator('[data-testid="call-status"][data-status="done"]').isVisible(), 8000), '4.4 cliente vê "Pedido de ajuda resolvido"');
  check(await waitFor(() => g1.locator('[data-testid="calls-waiting"]').count().then((n) => n === 0), 6000), '4.5 chamada sai da lista de espera');
  check(await waitFor(() => c.locator('[data-testid="call-waiter"]').isEnabled(), 6000), '4.6 cliente pode voltar a chamar');

  // ---------- 5. Pedir a conta (com o total da mesa) ----------
  const frango = Number(sql("select id from menu_items where name = 'Frango Churrasco'")), moelas = Number(sql("select id from menu_items where name = 'Moelas' and category_id = 'entradas'"));
  await api('/api/pedidos', { token: tok(1), key: key(), lines: [{ itemId: frango, quantity: 1 }] });
  await api('/api/pedidos', { token: tok(1), key: key(), lines: [{ itemId: moelas, quantity: 2 }] });
  await c.locator('[data-testid="call-bill"]').click();
  check(await waitFor(() => c.locator('[data-testid="call-status"][data-kind="bill"]').innerText().then((t) => /10\s000 FCFA/.test(t)), 8000), '5.1 conta pedida com o total estimado (6 000 + 2×2 000 = 10 000 FCFA)');
  check(await waitFor(() => g1.locator('[data-testid="calls-waiting"] [data-kind="bill"]').innerText().then((t) => /Total da mesa: 10\s000 FCFA/.test(t)), 8000), '5.2 garçom vê o total da mesa na chamada');
  await g1.locator('[data-testid="calls-waiting"] [data-kind="bill"]').getByRole('button', { name: 'Resolvido' }).click();
  await waitFor(() => g1.locator('[data-testid="calls-waiting"]').count().then((n) => n === 0), 6000);
  await api('/api/pedidos', { token: tok(1), key: key(), lines: [{ itemId: moelas, quantity: 1 }] });
  const bill2 = await api('/api/chamadas', { token: tok(1), kind: 'bill', key: key() });
  check(bill2.body?.call?.amount === 2000, `5.3 nova conta só conta o que foi pedido depois da última (${bill2.body?.call?.amount})`);
  sql(`update service_calls set status = 'done', done_at = now() where table_id = ${tid(1)} and kind = 'bill' and status <> 'done'`);

  // ---------- 6. Chamar gerente e cancelar ----------
  await c.reload({ waitUntil: 'networkidle' });
  await c.locator('[data-testid="call-manager"]').click();
  await waitFor(() => c.locator('[data-testid="call-status"][data-kind="manager"]').isVisible(), 6000);
  check(await waitFor(() => ap.locator('[data-testid="calls-waiting"] [data-kind="manager"]').isVisible(), 6000), '6.1 "Chamar gerente" chega à gestão');
  await sleep(1500);
  check(!(await g1.evaluate(() => /CLIENTE A CHAMAR/.test(document.title))), '6.2 "Chamar gerente" não toca no garçom');
  await c.locator('[data-testid="call-status"][data-kind="manager"]').getByRole('button', { name: 'Cancelar' }).click();
  check(await waitFor(() => sql(`select status from service_calls where table_id = ${tid(1)} and kind = 'manager'`) === 'cancelled', 6000), '6.3 cliente cancela a chamada');
  check(await waitFor(() => ap.locator('[data-testid="calls-waiting"] [data-kind="manager"]').count().then((n) => n === 0), 8000), '6.4 chamada cancelada sai do painel');

  // ---------- 7. Sem internet: não fica em fila, aviso honesto ----------
  const before = sql('select count(*) from service_calls');
  await cctx.setOffline(true);
  await c.locator('[data-testid="call-waiter"]').click();
  check(await waitFor(() => c.locator('text=Sem ligação à internet: faça sinal a um empregado.').isVisible(), 4000), '7.1 sem internet: "faça sinal a um empregado"');
  await cctx.setOffline(false); await sleep(1000);
  check(sql('select count(*) from service_calls') === before, '7.2 nenhuma chamada fantasma criada mais tarde');

  // ---------- 8. Garçom muda o estado de um pedido ----------
  await g1.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' });
  const ord = sql(`select number from orders where table_id = ${tid(1)} and status = 'pending' order by created_at limit 1`);
  await g1.locator(`[data-testid="order-${ord}"]`).getByRole('button', { name: 'Iniciar preparação' }).click();
  check(await waitFor(() => sql(`select status from orders where table_id = ${tid(1)} and number = ${ord} and origin = 'central'`) === 'preparing', 8000), '8.1 garçom pode avançar o estado do pedido');

  // ---------- 9. Segurança e limites ----------
  check((await api(`/api/chamadas?t=invalido`, null, 'GET')).status === 404, '9.1 estado das chamadas exige o QR da mesa');
  const callT1 = sql(`select id from service_calls where table_id = ${tid(1)} and kind = 'manager'`);
  sql(`update service_calls set status = 'open' where id = '${callT1}'`);
  const del = await fetch(`${B}/api/chamadas/${callT1}?t=${tok(2)}`, { method: 'DELETE' });
  check(del.status === 404 && sql(`select status from service_calls where id = '${callT1}'`) === 'open', '9.2 QR de outra mesa não cancela a chamada');
  sql(`update service_calls set status = 'done' where table_id = ${tid(1)}`);
  sql(`delete from service_calls where table_id = ${tid(2)}`);
  let last = null;
  for (let i = 0; i < 13; i++) { last = await api('/api/chamadas', { token: tok(2), kind: 'waiter', key: key() }); sql(`update service_calls set status = 'done' where table_id = ${tid(2)}`); }
  check(last.status === 429, `9.3 limite de chamadas por mesa (13.ª em 10 min → HTTP ${last.status})`);
  check((await api('/api/chamadas', { token: tok(1), kind: 'cozinha', key: key() })).status === 400, '9.4 tipo de chamada inválido recusado');

  // ---------- 10. Histórico de atendimento ----------
  await ap.goto(B + '/admin/atendimento', { waitUntil: 'networkidle' });
  const kpis = await ap.locator('[data-testid="service-kpis"]').innerText();
  check(/chamadas\s*\n?\s*\d+/i.test(kpis) && /resposta/i.test(kpis), '10.1 indicadores de atendimento visíveis');
  check(await ap.locator('[data-testid="por-pessoa"]').getByText('Aissatu').first().isVisible(), '10.2 "Por pessoa" mostra quem atendeu (Aissatu)');
  check(await ap.locator('[data-testid="historico-chamadas"]').getByText('Mesa 1').first().isVisible(), '10.3 histórico lista as chamadas da Mesa 1');

  // ---------- 11. Gerente gere garçons; desativar retira das mesas e termina a sessão ----------
  const gctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  let gp = null;
  try { gp = await login(gctx, 'gerente1@nokau.test', 'minha-nova-senha-77', 'gerente'); } catch {}
  if (gp) {
    await gp.goto(B + '/admin/garcons', { waitUntil: 'networkidle' });
    check(/\/admin\/garcons/.test(gp.url()), '11.1 Gerente acede à página Garçons');
    await gp.goto(B + '/admin/utilizadores', { waitUntil: 'networkidle' });
    check(!/\/admin\/utilizadores/.test(gp.url()), '11.2 Gerente continua sem acesso a Utilizadores');
    await gp.goto(B + '/admin/garcons', { waitUntil: 'networkidle' });
    await gp.locator(`[data-testid="waiter-${W2.email}"]`).getByRole('button', { name: 'Desativar' }).click();
  } else {
    errs.push('aviso: conta gerente1 inexistente (correr roles.js antes) — passo 11 feito pelo Admin');
    await ap.goto(B + '/admin/garcons', { waitUntil: 'networkidle' });
    await ap.locator(`[data-testid="waiter-${W2.email}"]`).getByRole('button', { name: 'Desativar' }).click();
  }
  check(await waitFor(() => sql(`select active from admin_users where email = '${W2.email}'`) === 'f', 6000), '11.3 garçom desativado');
  check(sql(`select coalesce(waiter_id::text,'null') from dining_tables where number = 2`) === 'null', '11.4 … e retirado das suas mesas');
  await g2.goto(B + '/admin/mesas', { waitUntil: 'networkidle' });
  check(/\/admin\/login/.test(g2.url()), '11.5 sessão do garçom desativado termina de imediato');

  await b.close();
  console.log(`OK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
})().catch((e) => { console.log('FATAL', e.message.slice(0, 900)); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
