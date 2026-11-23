/* Auditoria 2: o pedido é fechado em "Pedidos" (fluxo real da equipa) → o pagamento tem de ficar registado e somado.
   E o acesso "Entrar" no site público (cliente, reservas, equipa). */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const S = __dirname;
const AUTH = require(`${S}/auth-helper.js`);
const C = 'http://localhost:3100';
const cq = (s) => execSync('psql -h localhost -p 5433 -U postgres -d nokau_test -tA -q -v ON_ERROR_STOP=1', { input: s }).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; }
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };
const raw = async (p, sel) => Number(await p.locator(sel).getAttribute('data-raw'));
let kn = 0; const key = () => `auditoria2${Date.now().toString(36)}${(kn++).toString().padStart(6, '0')}`;

(async () => {
  execSync(`${S}/servers.sh central`, { stdio: 'pipe' });
  cq('delete from auth_throttle');
  cq("delete from admin_users where email in ('gerente.aud2@nokau.test','garcom.aud2@nokau.test')");
  cq(`insert into admin_users (email, password_hash, role, name) values ('gerente.aud2@nokau.test', '${hashPw('gerente-aud-2')}', 'gerente', 'Gerente Aud2'), ('garcom.aud2@nokau.test', '${hashPw('garcom-aud-2')}', 'garcom', 'Garcom Aud2')`);
  const b = await chromium.launch();
  const login = async (email, pw) => {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 950 } }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${email}: ${e.message.slice(0, 150)}`));
    await p.goto(C + '/admin/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
    await p.waitForURL(/\/admin\/(dashboard|mesas|pedidos)/, { waitUntil: 'commit', timeout: 20000 }); return p;
  };

  // pedido real feito pelo cliente na mesa 9
  const tok = cq('select qr_token from dining_tables where number = 9');
  const item = Number(cq("select id from menu_items where name = 'Moelas' limit 1"));
  const o = await (await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(C) }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: item, quantity: 3 }] }) })).json();
  const total = Number(cq(`select total from orders where id = '${o.orderId}'`)), num = cq(`select number from orders where id = '${o.orderId}'`);
  check(total > 0, `1.1 pedido real #${num} de ${total} FCFA`);

  const g = await login('gerente.aud2@nokau.test', 'gerente-aud-2');
  await g.goto(C + '/admin/dashboard?r=hoje', { waitUntil: 'networkidle' });
  const paid0 = await raw(g, '[data-testid="hero-paid"]');

  // fluxo real: Pedidos → Iniciar preparação → Marcar concluído
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  const card = g.locator(`[data-testid="order-${num}"]`);
  await card.getByRole('button', { name: 'Iniciar preparação' }).click();
  await waitFor(() => card.getAttribute('data-status').then((s) => s === 'preparing'));
  await card.getByRole('button', { name: 'Marcar concluído' }).click();
  await waitFor(() => card.getAttribute('data-status').then((s) => s === 'done'));
  check(await card.locator('[data-testid="order-unpaid"]').isVisible(), '1.2 concluído sem pagamento → aviso "Por cobrar" no cartão');
  await g.goto(C + '/admin/dashboard?r=hoje', { waitUntil: 'networkidle' });
  const toCollect = await raw(g, '[data-testid="hero-tocollect"]');
  check(toCollect >= total, `1.3 Visão geral mostra "Por cobrar" (${toCollect} FCFA) — antes isto ficava invisível`);

  // receber o pagamento no próprio cartão
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  await card.locator('[data-testid="order-pay-open"]').click();
  check(await card.locator('[data-testid="order-pay-confirm"]').isDisabled(), '1.4 sem método escolhido não confirma');
  await card.locator('[data-testid="order-pay"] label', { hasText: 'Pagamento à mão' }).click();
  await card.locator('[data-testid="order-pay"] input[inputmode=numeric]').fill(String(total + 1000));
  check(await card.locator('text=Troco: 1').isVisible(), '1.5 dinheiro: mostra o troco');
  await card.locator('[data-testid="order-pay-confirm"]').click();
  check(await waitFor(() => card.locator('[data-testid="order-paid"]').isVisible(), 15000), '1.6 cartão passa a "Pago"');
  const pay = cq(`select p.amount||'|'||p.method||'|'||p.tendered||'|'||p.received_by||'|'||(p.receipt_number is not null) from payments p join orders o on o.payment_id = p.id where o.id = '${o.orderId}'`);
  check(pay === `${total}|cash|${total + 1000}|Gerente Aud2|true`, `1.7 pagamento registado na base de dados com recibo (${pay})`);

  await g.goto(C + '/admin/dashboard?r=hoje', { waitUntil: 'networkidle' });
  const paid1 = await raw(g, '[data-testid="hero-paid"]');
  check(paid1 - paid0 === total, `1.8 "Pagamentos recebidos" soma o dinheiro: ${paid0} → ${paid1} FCFA (+${total})`);
  const tc1 = await g.locator('[data-testid="hero-tocollect"]').getAttribute('data-raw').catch(() => '0');
  check(Number(tc1 ?? 0) === toCollect - total, '1.9 "Por cobrar" desce o mesmo valor');
  await g.goto(C + '/admin/pagamentos?r=hoje', { waitUntil: 'networkidle' });
  const txt = await g.locator('[data-testid="payments-list"]').innerText();
  check(/Mesa 9/.test(txt) && /Pagamento à mão \(dinheiro\)/.test(txt), '1.10 aparece na lista de Pagamentos (mesa, método)');
  const csv = await (await g.context().request.get(`${C}/admin/relatorios/csv?tipo=pagamentos&r=hoje`)).text();
  check(csv.split('\n').some((l) => l.includes('Mesa 9') && l.includes('Pagamento à mão (dinheiro)') && l.includes(String(total))), '1.11 e no CSV de pagamentos dos Relatórios');

  // garçom não recebe pagamentos (regra existente: só Admin e Gerente)
  const w = await login('garcom.aud2@nokau.test', 'garcom-aud-2');
  await w.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  check(await w.locator('[data-testid="order-pay-open"]').count() === 0, '1.12 garçom não vê "Receber pagamento"');

  // ---------- acesso "Entrar" no site ----------
  for (const [name, opts] of [['computador', { viewport: { width: 1366, height: 900 } }], ['telemóvel', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opts); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`site ${name}: ${e.message.slice(0, 150)}`));
    await p.goto(C + '/', { waitUntil: 'load' });
    if (name === 'computador') await p.locator('[data-testid="header-login"]').click();
    else {
      const top = p.locator('[data-testid="mobile-top-login"]'); const bx = await top.boundingBox();
      check(await top.isVisible() && bx && bx.y < 80 && bx.height >= 32, '2.0 telemóvel: "Entrar" visível no topo, sem abrir o menu');
      await p.getByRole('button', { name: /menu/i }).first().click();
      check(await p.locator('[data-testid="mobile-login"]').waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false), '2.0b telemóvel: "Entrar" também dentro do menu');
      await p.keyboard.press('Escape'); await p.locator('#menu-movel').waitFor({ state: 'hidden' });
      await top.click();
    }
    await p.waitForURL(/\/entrar$/);
    check(await p.locator('[data-testid="login-cliente"]').isVisible() && await p.locator('[data-testid="login-reservas"]').isVisible() && await p.locator('[data-testid="login-equipa"]').isVisible(),
      `2.1 ${name}: "Entrar" no cabeçalho → cliente, reservas e equipa`);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1, `2.2 ${name}: sem deslocamento horizontal`);
    await p.screenshot({ path: `${S}/auditoria2-entrar-${name}.png` });
    for (const [id, re] of [['login-equipa', /\/admin\/login/], ['login-cliente', /\/cliente\/entrar/], ['login-reservas', /\/minhas-reservas/]]) {
      await p.goto(C + '/entrar'); await p.locator(`[data-testid="${id}"]`).click();
      check(await p.waitForURL(re, { timeout: 15000 }).then(() => true, () => false) && await waitFor(() => p.locator('input, [data-testid="visitor-empty"]').count().then((n) => n > 0), 10000), `2.3 ${name}: ${id} abre a página certa`);
    }
    await ctx.close();
  }

  await b.close();
  cq("delete from admin_users where email in ('gerente.aud2@nokau.test','garcom.aud2@nokau.test')");
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n')[0]); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
