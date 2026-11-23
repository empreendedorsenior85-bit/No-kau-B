/* Etapa C — conta obrigatória para pedir: carrinho com entrar/criar conta, recusa sem sessão, equipa,
   sessão terminada, fila offline à espera de login, contas no servidor do restaurante (sincronização e conflitos). */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const S = __dirname;
const AUTH = require(`${S}/auth-helper.js`);
const C = 'http://localhost:3100', L = 'http://localhost:3200';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tA -v ON_ERROR_STOP=1 -q`, { input: s }).toString().trim();
const cq = (s) => q('nokau_test', s), lq = (s) => q('nokau_local', s);
const srv = (a) => execSync(`${S}/servers.sh ${a}`, { stdio: 'pipe' });
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
let kn = 0; const key = () => `etapac${Date.now().toString(36)}${(kn++).toString().padStart(6, '0')}`;
const uniq = () => Date.now().toString().slice(-7) + String(kn++).padStart(2, '0');
const watch = (p, tag) => p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message.slice(0, 150)}`));
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };

async function register(p, base, { name, email, phone, pw }) {
  const f = p.locator('[data-testid="register-form"]');
  await f.locator('input[name=name]').fill(name); await f.locator('input[name=email]').fill(email); await f.locator('input[name=phone]').fill(phone);
  await f.locator('input[name=password]').fill(pw); await f.locator('input[name=password2]').fill(pw); await f.locator('input[name=consent]').check();
  await f.getByRole('button', { name: 'Criar conta' }).click();
}
async function login(p, id, pw) {
  const f = p.locator('[data-testid="client-login-form"]');
  await f.locator('input[name=identifier]').fill(id); await f.locator('input[name=password]').fill(pw);
  await f.getByRole('button', { name: 'Entrar' }).click();
}
const cartNames = (p) => p.locator('[role="dialog"] ul li h3, [role="dialog"] ul li p.font-display').allInnerTexts();

(async () => {
  srv('both');
  await waitFor(() => cq("select count(*) from information_schema.tables where table_name = 'customer_aliases'") === '1'
    && lq("select count(*) from information_schema.tables where table_name = 'customer_aliases'") === '1', 60000);
  await waitFor(() => lq("select count(*) from admin_users where email = 'gerente@nokau.test'") === '1', 60000);
  cq('delete from auth_throttle'); lq('delete from auth_throttle');
  cq("update menu_items set available = true, active = true where name in ('Frango Churrasco','Moelas','Sprite')");
  const T = 5, tok = cq(`select qr_token from dining_tables where number = ${T}`);
  const moelas = Number(cq("select id from menu_items where name = 'Moelas' limit 1"));
  const b = await chromium.launch();

  // ---------- 1. Sem conta não se envia; o carrinho pede conta sem perder nada ----------
  const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage(); watch(p, 'cliente');
  await p.goto(`${C}/m/${tok}`, { waitUntil: 'networkidle' });
  check(/Para pedir é preciso conta/.test(await p.locator('[data-testid="client-link"]').innerText()), '1.1 o menu avisa que para pedir é preciso conta');
  await p.getByRole('button', { name: 'Adicionar Frango Churrasco', exact: true }).click();
  await p.getByRole('button', { name: 'Mais Frango Churrasco' }).click();
  await p.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click();
  await p.getByRole('button', { name: /Ver pedido/ }).click();
  check(await p.getByRole('button', { name: /Confirmar e enviar pedido/ }).count() === 0 && await p.locator('[data-testid="gate-open"]').isVisible(), '1.2 sem conta: o carrinho mostra "Entrar ou criar conta para enviar" (não deixa enviar)');
  await p.locator('[data-testid="gate-open"]').click();
  check(await p.locator('[data-testid="account-gate"]').isVisible() && await p.locator('[data-testid="account-gate"] [data-testid="register-form"]').isVisible(), '1.3 criar conta dentro do carrinho (sem sair da página)');
  const A = { name: 'Mamadu Conta', email: `conta${uniq()}@teste.gw`, phone: '95' + uniq().slice(-7), pw: 'mamadu-senha-1' };
  const t0 = Date.now();
  await register(p, C, A);
  await p.waitForURL(new RegExp(`/m/${tok}$`), { timeout: 20000 });
  const reopened = await waitFor(() => p.getByRole('button', { name: /Confirmar e enviar pedido/ }).isVisible(), 10000);
  check(reopened, `1.4 depois de criar conta volta ao carrinho aberto, pronto a enviar (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const dlg = await p.locator('[role="dialog"]').innerText();
  check(/Frango Churrasco/.test(dlg) && /Moelas/.test(dlg) && /2/.test(dlg), '1.5 o carrinho continua com os mesmos produtos e quantidades');
  await p.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await p.waitForURL(/\/pedido\//, { timeout: 20000 });
  const aid = cq(`select id from customers where email = '${A.email}'`);
  check(cq(`select count(*) from orders where customer_id = '${aid}'`) === '1', '1.6 pedido enviado e guardado na conta nova');

  // ---------- 2. "Já tenho conta" no carrinho ----------
  const p2 = await (await b.newContext({ ...devices['iPhone 13'] })).newPage(); watch(p2, 'cliente2');
  await p2.goto(`${C}/m/${tok}`, { waitUntil: 'networkidle' });
  await p2.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click();
  await p2.getByRole('button', { name: /Ver pedido/ }).click(); await p2.locator('[data-testid="gate-open"]').click();
  await p2.locator('[data-testid="gate-tab-entrar"]').click();
  await login(p2, A.phone, A.pw);
  await p2.waitForURL(new RegExp(`/m/${tok}$`), { timeout: 20000 });
  check(await waitFor(() => p2.getByRole('button', { name: /Confirmar e enviar pedido/ }).isVisible(), 10000), '2.1 entrar (telefone + palavra-passe) dentro do carrinho → volta ao carrinho pronto a enviar');
  await p2.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(); await p2.waitForURL(/\/pedido\//, { timeout: 20000 });
  check(cq(`select count(*) from orders where customer_id = '${aid}'`) === '2', '2.2 segundo pedido na mesma conta');

  // ---------- 3. O servidor recusa pedidos sem sessão (não depende só do ecrã) ----------
  const n0 = cq('select count(*) from orders');
  const r = await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: moelas, quantity: 1 }] }) });
  const j = await r.json();
  check(r.status === 401 && j.loginRequired === true && !j.orderId && cq('select count(*) from orders') === n0, '3.1 API sem sessão → 401 "entre na sua conta" e nenhum pedido criado');
  const forged = await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'nk_client=forjado.abc' }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: moelas, quantity: 1 }] }) });
  check(forged.status === 401, '3.2 cookie de cliente forjado → 401');

  // ---------- 4. A equipa pode registar pedidos em nome da mesa ----------
  const sp = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); watch(sp, 'garcom');
  await sp.goto(`${C}/admin/login`); await sp.fill('input[name=email]', 'gerente@nokau.test'); await sp.fill('input[name=password]', 'senha-forte-123'); await sp.click('button[type=submit]');
  await sp.waitForURL(/\/admin\/(dashboard|mesas)/, { waitUntil: 'commit' });
  await sp.goto(`${C}/m/${tok}`, { waitUntil: 'networkidle' });
  check(/Sessão da equipa/.test(await sp.locator('[data-testid="client-link"]').innerText()), '4.1 equipa com sessão: o menu indica que pode pedir pela mesa');
  await sp.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click(); await sp.getByRole('button', { name: /Ver pedido/ }).click();
  await sp.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(); await sp.waitForURL(/\/pedido\//, { timeout: 20000 });
  check(true, '4.2 a equipa envia o pedido sem conta de cliente');

  // ---------- 5. Sessão terminada a meio: volta a pedir conta, o carrinho fica ----------
  const c5 = await b.newContext({ ...devices['Pixel 7'] }); await AUTH.loginClient(c5, C); const p5 = await c5.newPage(); watch(p5, 'cliente5');
  await p5.goto(`${C}/m/${tok}`, { waitUntil: 'networkidle' });
  await p5.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click(); await p5.getByRole('button', { name: /Ver pedido/ }).click();
  cq(`update auth_sessions set revoked_at = now() where kind = 'client' and subject = '${AUTH.TEST_CLIENT_ID}' and revoked_at is null`);
  const n5 = cq('select count(*) from orders');
  await p5.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  check(await waitFor(() => p5.locator('[data-testid="gate-open"]').isVisible(), 15000) && cq('select count(*) from orders') === n5, '5.1 sessão terminada → o carrinho pede para entrar de novo; nada enviado');
  check(/Moelas/.test(await p5.locator('[role="dialog"]').innerText()) || (await p5.evaluate(() => Object.keys(localStorage).some((k) => /Moelas|itemId/.test(localStorage.getItem(k) ?? '')))), '5.2 o carrinho continua guardado');
  const rec5 = await p5.evaluate(() => new Promise((res) => { const r = indexedDB.open('nokau'); r.onsuccess = () => { try { const t = r.result.transaction('outbox').objectStore('outbox').getAll(); t.onsuccess = () => res(t.result.filter((x) => x.state === 'queued').length); } catch { res(0); } }; r.onerror = () => res(0); }));
  check(rec5 === 0, '5.3 o pedido recusado por falta de sessão não fica preso na fila do telemóvel');

  // ---------- 6. Pedido feito sem rede, sessão termina antes de chegar: espera pelo login e segue ----------
  const c6 = await b.newContext({ ...devices['Pixel 7'] }); const p6 = await c6.newPage(); watch(p6, 'cliente6');
  await p6.goto(`${C}/m/${tok}`, { waitUntil: 'networkidle' });
  await p6.getByRole('button', { name: /Ver pedido/ }).click().catch(() => {});
  // entra com a conta A (pelo formulário normal) e prepara o menu offline
  await p6.goto(`${C}/cliente/entrar?volta=/m/${tok}`, { waitUntil: 'networkidle' }); await login(p6, A.email, A.pw);
  await p6.waitForURL(new RegExp(`/m/${tok}$`), { timeout: 20000 }); await p6.waitForLoadState('networkidle');
  await waitFor(() => p6.evaluate(() => !!navigator.serviceWorker?.controller), 15000);
  await c6.setOffline(true);
  await p6.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click(); await p6.getByRole('button', { name: /Ver pedido/ }).click();
  await p6.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  check(await waitFor(() => p6.locator('[data-testid="outbox-item"][data-state="queued"]').isVisible(), 10000), '6.1 sem rede: pedido guardado no telemóvel');
  const n6 = cq(`select count(*) from orders where customer_id = '${aid}'`);
  cq(`update auth_sessions set revoked_at = now() where kind = 'client' and subject = '${aid}' and revoked_at is null`); // sessão termina (ex.: palavra-passe mudada)
  await c6.setOffline(false);
  await p6.evaluate(() => window.dispatchEvent(new Event('online')));
  check(await waitFor(() => p6.locator('[data-testid="outbox-needs-login"]').isVisible(), 20000) && cq(`select count(*) from orders where customer_id = '${aid}'`) === n6,
    '6.2 a rede volta mas a sessão terminou: o pedido fica guardado com "entre na sua conta" (não é perdido nem recusado)');
  await p6.locator('[data-testid="outbox-needs-login"] a').click(); await p6.waitForURL(/\/cliente\/entrar/);
  await login(p6, A.email, A.pw); await p6.waitForURL(new RegExp(`/m/${tok}$`), { timeout: 20000 });
  check(await waitFor(() => cq(`select count(*) from orders where customer_id = '${aid}'`) === String(Number(n6) + 1), 25000), '6.3 depois de entrar, o pedido guardado segue sozinho para o restaurante, na conta certa');

  // ---------- 7. Contas no servidor do restaurante ----------
  check(await waitFor(() => lq(`select count(*) from customers where id = '${aid}'`) === '1', 30000), '7.1 conta criada no site chega ao servidor do restaurante');
  check(lq(`select password_hash from customers where id = '${aid}'`).startsWith('scrypt$'), '7.2 vai só o hash da palavra-passe (scrypt), nunca a palavra-passe');
  const tokL = lq(`select qr_token from dining_tables where number = ${T}`);
  const pl = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); watch(pl, 'cliente-local');
  await pl.goto(`${L}/m/${tokL}`, { waitUntil: 'networkidle' });
  await pl.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click(); await pl.getByRole('button', { name: /Ver pedido/ }).click();
  await pl.locator('[data-testid="gate-open"]').click(); await pl.locator('[data-testid="gate-tab-entrar"]').click();
  await login(pl, A.email, A.pw); await pl.waitForURL(new RegExp(`/m/${tokL}$`), { timeout: 20000 });
  await waitFor(() => pl.getByRole('button', { name: /Confirmar e enviar pedido/ }).isVisible(), 10000);
  await pl.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(); await pl.waitForURL(/\/pedido\//, { timeout: 20000 });
  const lid = lq(`select id from orders where customer_id = '${aid}' order by created_at desc limit 1`);
  check(!!lid && lq(`select origin from orders where id = '${lid}'`) === 'local', '7.3 no Wi-Fi do restaurante: entra com a mesma conta e pede ao servidor local');
  check(await waitFor(() => cq(`select customer_id from orders where id = '${lid}'`) === aid, 30000), '7.4 o pedido feito no restaurante chega ao site já ligado à conta do cliente');
  // conta criada no restaurante
  const Bc = { name: 'Fatu Restaurante', email: `local${uniq()}@teste.gw`, phone: '96' + uniq().slice(-7), pw: 'fatu-senha-123' };
  const pr = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); watch(pr, 'registo-local');
  await pr.goto(`${L}/cliente/registo`, { waitUntil: 'networkidle' }); await register(pr, L, Bc); await pr.waitForURL(/\/cliente$/, { timeout: 20000 });
  check(lq(`select origin from customers where email = '${Bc.email}'`) === 'local', '7.5 conta criada no servidor do restaurante');
  check(await waitFor(() => cq(`select count(*) from customers where email = '${Bc.email}'`) === '1', 30000), '7.6 e enviada ao site central');
  const pc = await (await b.newContext()).newPage();
  await pc.goto(`${C}/cliente/entrar`, { waitUntil: 'networkidle' }); await login(pc, Bc.email, Bc.pw);
  check(await pc.waitForURL(/\/cliente$/, { timeout: 15000 }).then(() => true, () => false), '7.7 entra no site com a palavra-passe criada no restaurante');
  cq(`update customers set active = false where email = '${Bc.email}'`);
  check(await waitFor(() => lq(`select active from customers where email = '${Bc.email}'`) === 'f', 30000), '7.8 conta desativada no site → desativada também no restaurante');
  check(await waitFor(() => lq(`select count(*) from auth_sessions where kind = 'client' and subject = (select id from customers where email = '${Bc.email}') and revoked_at is null`) === '0', 10000), '7.9 e as sessões dessa conta no restaurante terminam');

  // ---------- 8. A mesma pessoa registada nos dois lados sem internet ----------
  srv('stop-central');
  const D = { name: 'Duplo Teste', email: `duplo${uniq()}@teste.gw`, phone: '97' + uniq().slice(-7) };
  const pd = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
  await pd.goto(`${L}/cliente/registo?volta=/m/${tokL}`, { waitUntil: 'networkidle' }); await register(pd, L, { ...D, pw: 'senha-local-11' });
  await pd.waitForURL(new RegExp(`/m/${tokL}`), { timeout: 20000 }); await pd.waitForLoadState('networkidle');
  await pd.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click(); await pd.getByRole('button', { name: /Ver pedido/ }).click();
  await pd.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(); await pd.waitForURL(/\/pedido\//, { timeout: 20000 });
  const localId = lq(`select id from customers where email = '${D.email}'`);
  const dOrder = lq(`select id from orders where customer_id = '${localId}' limit 1`);
  check(!!dOrder, '8.1 sem internet: conta nova e pedido no servidor do restaurante');
  const centralId = cq(`insert into customers (name, email, phone, password_hash) values ('${D.name}', '${D.email}', '+245${D.phone}', '${hashPw('senha-central-22')}') returning id`);
  srv('central');
  check(await waitFor(() => cq(`select customer_id from orders where id = '${dOrder}'`) === centralId, 40000), '8.2 internet volta: a conta do restaurante é a mesma pessoa → o pedido fica na conta do site (sem duplicar a pessoa)');
  check(await waitFor(() => lq(`select count(*) from customers where id = '${localId}'`) === '0' && lq(`select customer_id from orders where id = '${dOrder}'`) === centralId, 30000), '8.3 no restaurante as contas fundem-se: o pedido passa para a conta do site');
  check(cq(`select count(*) from customers where email = '${D.email}'`) === '1' && lq(`select count(*) from customers where email = '${D.email}'`) === '1', '8.4 uma só conta por email nos dois servidores');
  check(cq("select count(*) from audit_log where action = 'sync.customer_alias'") !== '0', '8.5 a fusão fica registada na Atividade');

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
