/* Correções encontradas na gravação do tutorial: textos do painel, "A minha conta" no cabeçalho, reserva pré-preenchida. */
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const { clientCookieValue } = require('./auth-helper');
const B = 'http://localhost:3100';
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres nokau_test -tAc "${q}"`).toString().trim();

(async () => {
  execSync(`${__dirname}/servers.sh central`, { stdio: 'pipe' });
  clientCookieValue(B); // garante a conta de teste (cliente.teste@nokau.test / cliente-teste-1)
  sql("delete from auth_throttle");
  const b = await chromium.launch();

  // 1. Textos do painel
  { const p = await (await b.newContext()).newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(B + '/admin/login', { waitUntil: 'load' });
    const t = await p.locator('body').innerText();
    check(/equipa do restaurante/.test(t) && !/reservado ao gerente/.test(t), '1.1 entrada da equipa: "Acesso reservado à equipa do restaurante" (já não diz "ao gerente")');
    await p.context().close(); }
  const src = require('node:fs').readFileSync(`${__dirname}/../../src/components/admin/AuthForms.tsx`, 'utf8');
  check(/Email do administrador/.test(src) && /Criar conta de administrador/.test(src) && !/do gerente/.test(src), '1.2 primeiro acesso: "Email do administrador" / "Criar conta de administrador"');

  for (const [name, opts] of [['computador', { viewport: { width: 1366, height: 900 } }], ['telemóvel', devices['Pixel 7']]]) {
    const ctx = await b.newContext(opts); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    const login = name === 'computador' ? p.getByTestId('header-login') : p.getByTestId('mobile-top-login');
    // 2. sem sessão
    await p.goto(B + '/', { waitUntil: 'load' });
    check((await login.innerText()).trim() === 'Entrar' && (await login.getAttribute('href')) === '/entrar', `2.1 ${name}: sem sessão, o cabeçalho mostra "Entrar"`);
    const api0 = await p.request.get(B + '/api/cliente/eu');
    check(api0.status() === 401 && /no-store/.test(api0.headers()['cache-control'] ?? ''), `2.2 ${name}: /api/cliente/eu sem sessão → 401, sem cache`);
    await p.goto(B + '/reservas', { waitUntil: 'load' }); await sleep(800);
    check((await p.locator('form input[name=name]:visible').inputValue()) === '', `2.3 ${name}: reserva sem sessão começa vazia`);
    // 3. entrar pelo formulário real
    await p.goto(B + '/cliente/entrar', { waitUntil: 'load' });
    await p.locator('input[name=identifier]:visible').fill('cliente.teste@nokau.test'); await p.locator('input[name=password]:visible').fill('cliente-teste-1');
    await p.locator('button:visible', { hasText: 'Entrar' }).last().click(); await p.waitForURL(/\/cliente/, { timeout: 20000 }); await sleep(800);
    const ck = (await ctx.cookies()).find((c) => c.name === 'nk_has_client');
    check(ck && ck.value === '1' && !ck.httpOnly, `3.1 ${name}: ao entrar, fica o cookie de indicação (legível, valor "1", sem dados pessoais)`);
    check((await ctx.cookies()).find((c) => c.name === 'nk_client')?.httpOnly === true, `3.2 ${name}: a sessão continua num cookie HttpOnly`);
    await p.goto(B + '/', { waitUntil: 'load' }); await sleep(500);
    check((await login.innerText()).trim() === 'A minha conta' && (await login.getAttribute('href')) === '/cliente', `3.3 ${name}: com sessão, o cabeçalho mostra "A minha conta" → /cliente`);
    await login.click(); await p.waitForURL(/\/cliente/, { timeout: 15000 });
    check(new URL(p.url()).pathname === '/cliente', `3.4 ${name}: "A minha conta" abre a área do cliente`);
    const api1 = await p.request.get(B + '/api/cliente/eu'); const me = await api1.json();
    check(api1.status() === 200 && me.name === 'Cliente Teste' && me.phone === '+245900000001' && Object.keys(me).sort().join() === 'email,name,ok,phone', `3.5 ${name}: /api/cliente/eu devolve só nome, telefone e email do próprio cliente`);
    await p.goto(B + '/reservas', { waitUntil: 'load' }); await sleep(1500);
    const f = p.locator('form').filter({ has: p.locator('input[name=date]') }).first();
    check((await f.locator('input[name=name]').inputValue()) === 'Cliente Teste' && (await f.locator('input[name=phone]').inputValue()) === '+245900000001' && (await f.locator('input[name=email]').inputValue()) === 'cliente.teste@nokau.test', `3.6 ${name}: reserva vem preenchida com nome, telefone e email da conta`);
    // 4. sair
    await p.goto(B + '/cliente', { waitUntil: 'load' });
    if (name === 'computador') await p.getByText('Terminar sessão').first().click();
    else { await p.locator('button[aria-controls="cliente-menu"]:visible').first().click(); await sleep(700); await p.locator('#cliente-menu').getByText('Terminar sessão').click(); }
    await sleep(2000);
    check(!(await ctx.cookies()).some((c) => c.name === 'nk_has_client' || c.name === 'nk_client'), `4.1 ${name}: ao terminar sessão, os dois cookies são apagados`);
    await p.goto(B + '/', { waitUntil: 'load' }); await sleep(400);
    check((await login.innerText()).trim() === 'Entrar', `4.2 ${name}: depois de sair, volta a "Entrar"`);
    await ctx.close();
  }

  // 5. cookie de indicação falsificado, sem sessão: não dá acesso a nada
  { const ctx = await b.newContext(); await ctx.addCookies([{ name: 'nk_has_client', value: '1', url: B }]); const p = await ctx.newPage();
    const r = await p.request.get(B + '/api/cliente/eu'); check(r.status() === 401, '5.1 cookie de indicação sozinho: API devolve 401 (não é uma sessão)');
    await p.goto(B + '/cliente', { waitUntil: 'load' });
    await p.waitForURL(/\/entrar/, { timeout: 10000 }).catch(() => {}); // o redirecionamento chega no streaming da página
    check(/\/cliente\/entrar/.test(p.url()) && !/Terminar sessão/.test(await p.locator('body').innerText()), '5.2 cookie de indicação sozinho: /cliente pede para entrar, sem mostrar dados');
    await p.goto(B + '/reservas', { waitUntil: 'load' }); await sleep(1200);
    check((await p.locator('form input[name=name]:visible').inputValue()) === '', '5.3 cookie de indicação sozinho: a reserva não é preenchida');
    await ctx.close(); }

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n')[0]); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
