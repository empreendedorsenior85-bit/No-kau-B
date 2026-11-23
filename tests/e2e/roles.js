/* Perfis Admin e Gerente — corre depois do e2e.js (usa o estado da base de dados). */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const B = 'http://localhost:3100';
const ADMIN = 'gerente@nokau.test', PASS = 'senha-forte-123';
const G1 = 'gerente1@nokau.test', G1PASS = 'gerente-pass-111';
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(ctx, email, pass) {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/401|404|net::ERR/.test(m.text())) errs.push(`${email}: ${m.text().slice(0, 140)}`); });
  await p.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', pass);
  const t0 = Date.now(); await p.click('button[type=submit]');
  await Promise.race([p.waitForSelector('nav[aria-label="Painel"]', { timeout: 12000 }), p.waitForSelector('text=/incorretos|Demasiadas/', { timeout: 12000 })]).catch(() => {});
  console.log(`DBG login ${email}: ${Date.now() - t0} ms -> ${p.url().replace(B, '')}`);
  return p;
}
const capture = (page) => { const box = { req: null }; page.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) box.req = { url: r.url(), headers: r.headers(), body: r.postData() }; }); return box; };
const replay = (ctx, c) => ctx.request.post(c.url, { headers: { 'content-type': c.headers['content-type'], 'next-action': c.headers['next-action'], accept: c.headers['accept'] ?? 'text/x-component' }, data: c.body });

(async () => {
  const b = await chromium.launch();
  const actx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const ap = await login(actx, ADMIN, PASS);

  check(sql(`select role from admin_users where email='${ADMIN}'`) === 'admin', '13.1 quem configurou o sistema ficou como Admin');
  check(await ap.locator('nav[aria-label="Painel"] >> text=Utilizadores').isVisible(), '13.2 Admin vê o separador "Utilizadores"');
  check(await ap.locator('aside >> text=Admin').first().isVisible(), '13.3 painel mostra o perfil "Admin"');

  // ---- Admin cria utilizadores ----
  await ap.goto(B + '/admin/utilizadores', { waitUntil: 'networkidle' }); await ap.waitForSelector('form select[name=role]');
  const create = async (email, role, pw) => {
    await ap.fill('form input[name=email]', email); await ap.selectOption('form select[name=role]', role); await ap.fill('form input[name=password]', pw);
    await ap.click('button:has-text("Criar utilizador")'); await sleep(1200);
  };
  await create(G1, 'gerente', G1PASS);
  check(sql(`select role||'|'||active from admin_users where email='${G1}'`) === 'gerente|true', '13.4 Admin criou um Gerente');
  check(await ap.locator(`[data-testid="user-${G1}"]`).isVisible(), '13.5 aparece na lista');
  await create(G1, 'gerente', G1PASS);
  check(await ap.locator('text=Já existe um utilizador').isVisible(), '13.6 email repetido recusado');
  check(sql(`select count(*) from admin_users where email='${G1}'`) === '1', '13.7 sem duplicado na base de dados');
  await create('gerente2@nokau.test', 'gerente', 'gerente-pass-222');
  check(!sql("select password_hash from admin_users where email='gerente1@nokau.test'").includes(G1PASS), '13.8 palavra-passe do novo utilizador com hash');
  check(await ap.locator(`select[id^="role-"]:disabled`).count() === 1, '13.9 Admin não pode alterar o próprio perfil (só o seu seletor está desativado)');

  // ---- Gerente: o que vê ----
  const gctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const gp = await login(gctx, G1, G1PASS);
  console.log('DBG gerente url:', gp.url(), '| body:', (await gp.innerText('body').catch(() => '?')).slice(0, 160).replace(/\n/g, ' | '));
  check(/\/admin\/dashboard/.test(gp.url()), '14.1 Gerente entra na visão geral');
  check(!(await gp.locator('nav[aria-label="Painel"] >> text=Utilizadores').count()), '14.2 Gerente NÃO vê "Utilizadores"');
  check(await gp.locator('aside >> text=Gerente').first().isVisible(), '14.3 painel mostra o perfil "Gerente"');
  await gp.goto(B + '/admin/utilizadores'); await gp.waitForURL('**/admin/dashboard', { timeout: 8000 }).catch(() => {});
  check(/\/admin\/dashboard/.test(gp.url()), '14.4 /admin/utilizadores reencaminha o Gerente');
  await gp.goto(B + '/admin/qr', { waitUntil: 'networkidle' });
  check(await gp.getByRole('link', { name: 'Descarregar PNG' }).first().isVisible(), '14.5 Gerente consulta e descarrega QR Codes');
  check((await gp.getByRole('button', { name: 'Gerar novo QR' }).count()) === 0 && (await gp.getByRole('button', { name: '+ Adicionar mesa' }).count()) === 0 && (await gp.getByRole('button', { name: 'Desativar' }).count()) === 0, '14.6 Gerente não tem botões de alterar mesas/QR');
  await gp.goto(B + '/admin/menu', { waitUntil: 'networkidle' }); check(await gp.locator('text=Novo produto').isVisible(), '14.7 Gerente gere o menu');
  await gp.goto(B + '/admin/mesas', { waitUntil: 'networkidle' }); check(await gp.locator('[data-testid="table-1"]').isVisible(), '14.8 Gerente consulta mesas');
  // Gerente atualiza um pedido
  const oid = sql("select id from orders where status='done' limit 1"); sql(`update orders set status='pending' where id='${oid}'`);
  await gp.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' });
  await gp.getByRole('button', { name: 'Iniciar preparação' }).first().click(); await sleep(1500);
  check(sql(`select status from orders where id='${oid}'`) === 'preparing', '14.9 Gerente atualiza o estado de um pedido');
  check(sql("select count(*) from audit_log where actor='gerente1@nokau.test' and action='order.status'") === '1', '14.10 auditoria regista o Gerente como autor');

  // ---- O servidor recusa ações de Admin feitas por um Gerente ----
  // captura as ações do Admin e repete-as com a sessão do Gerente
  const cap = capture(ap);
  await ap.goto(B + '/admin/qr', { waitUntil: 'networkidle' });
  ap.once('dialog', (d) => d.accept());
  await ap.locator('[data-testid="qr-4"]').getByRole('button', { name: 'Gerar novo QR' }).click(); await sleep(1500);
  const rot = cap.req; const tok4 = sql('select qr_token from dining_tables where number=4');
  const r1 = await replay(gctx, rot);
  check(sql('select qr_token from dining_tables where number=4') === tok4, `15.1 Gerente NÃO consegue gerar novo QR (ação repetida no servidor, HTTP ${r1.status()})`);
  await ap.goto(B + '/admin/utilizadores', { waitUntil: 'networkidle' });
  const cap2 = capture(ap);
  await ap.locator('[data-testid="user-gerente2@nokau.test"] select').selectOption('admin'); await sleep(1500);
  check(sql("select role from admin_users where email='gerente2@nokau.test'") === 'admin', '15.2 Admin promove gerente2 a Admin');
  sql("update admin_users set role='gerente' where email='gerente2@nokau.test'");
  const r2 = await replay(gctx, cap2.req);
  check(sql("select role from admin_users where email='gerente2@nokau.test'") === 'gerente', `15.3 Gerente NÃO consegue alterar perfis (HTTP ${r2.status()})`);
  const cap3 = capture(ap);
  await ap.goto(B + '/admin/qr', { waitUntil: 'networkidle' });
  await ap.locator('[data-testid="qr-6"]').getByRole('button', { name: 'Desativar' }).click(); await sleep(1500);
  check(sql('select active from dining_tables where number=6') === 'f', '15.4 Admin desativa a mesa 6');
  await ap.locator('[data-testid="qr-6"]').getByRole('button', { name: 'Ativar' }).click(); await sleep(1200);
  const r3 = await replay(gctx, cap3.req);
  check(sql('select active from dining_tables where number=6') === 't', `15.5 Gerente NÃO consegue desativar mesas (HTTP ${r3.status()})`);

  // ---- ciclo de vida das contas ----
  await ap.goto(B + '/admin/utilizadores', { waitUntil: 'networkidle' });
  await ap.locator(`[data-testid="user-${G1}"]`).getByRole('button', { name: 'Desativar' }).click(); await sleep(1500);
  check(sql(`select active from admin_users where email='${G1}'`) === 'f', '16.1 Admin desativa o Gerente');
  const st = await gctx.request.get(B + '/api/admin/orders'); check(st.status() === 401, `16.2 sessão do Gerente desativado deixa de funcionar de imediato (HTTP ${st.status()})`);
  const g2 = await b.newContext(); const gp2 = await login(g2, G1, G1PASS); check(/login/.test(gp2.url()) && await gp2.locator('text=incorretos').isVisible(), '16.3 conta desativada não consegue entrar');
  await ap.locator(`[data-testid="user-${G1}"]`).getByRole('button', { name: 'Ativar' }).click(); await sleep(1500);
  // redefinir palavra-passe
  await ap.locator(`[data-testid="user-${G1}"]`).getByRole('button', { name: 'Redefinir palavra-passe' }).click();
  await ap.locator(`input[id^="pw-"]`).fill('nova-palavra-passe-9'); await ap.getByRole('button', { name: 'Guardar' }).click(); await sleep(1500);
  const g3 = await b.newContext(); const gp3 = await login(g3, G1, G1PASS); check(await gp3.locator('text=incorretos').isVisible(), '16.4 palavra-passe antiga deixa de funcionar');
  const g4 = await b.newContext(); const gp4 = await login(g4, G1, 'nova-palavra-passe-9'); check(/\/admin\/dashboard/.test(gp4.url()), '16.5 nova palavra-passe funciona');
  // alterar a própria palavra-passe
  await gp4.goto(B + '/admin/conta', { waitUntil: 'networkidle' });
  await gp4.fill('input[name=current]', 'errada-errada-1'); await gp4.fill('input[name=next]', 'minha-nova-senha-77'); await gp4.click('button:has-text("Alterar palavra-passe")');
  await gp4.waitForSelector('text=atual está incorreta'); check(true, '16.6 palavra-passe atual errada é recusada');
  await gp4.fill('input[name=current]', 'nova-palavra-passe-9'); await gp4.fill('input[name=next]', 'minha-nova-senha-77'); await gp4.click('button:has-text("Alterar palavra-passe")');
  await gp4.waitForSelector('text=Palavra-passe alterada'); check(true, '16.7 Gerente altera a própria palavra-passe');
  const g5 = await b.newContext(); const gp5 = await login(g5, G1, 'minha-nova-senha-77'); check(/\/admin\/dashboard/.test(gp5.url()), '16.8 entra com a palavra-passe nova');
  check(sql("select count(*) from audit_log where action in ('user.create','user.role','user.deactivate','user.activate','user.password_reset','user.password_change','table.rotate_token')") >= '8', '16.9 ações de gestão registadas na auditoria');
  await ap.screenshot({ path: require('node:path').join(OUTDIR, 'shots', 'qr/admin-utilizadores.png') });

  // ---- Admin pode deixar de ser o único: dois Admins, e o último não se perde ----
  const a2 = sql("select count(*) from admin_users where role='admin' and active"); check(a2 === '1', `17.1 existe exatamente 1 Admin ativo (${a2})`);

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.map((x) => '  ✓ ' + x).join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.map((x) => '  ✗ ' + x).join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + [...new Set(errs)].map((x) => '  ! ' + x).join('\n'));
})().catch((e) => { console.error('FATAL', e.stack.split('\n').slice(0, 6).join('\n')); console.log('ok até agora:', ok.length, 'falhas:', bad); process.exit(1); });
