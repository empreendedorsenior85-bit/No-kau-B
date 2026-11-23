/* Tutorial da impressora: fácil de encontrar, conteúdo fiel ao sistema real, funciona em telemóvel e segue-se até imprimir. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process'); const crypto = require('node:crypto'); const fs = require('node:fs');
const S = __dirname;
const { startFakePrinter } = require(`${S}/fake-printer.js`);
const C = 'http://localhost:3100', L = 'http://localhost:3200';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tA -q -v ON_ERROR_STOP=1`, { input: s }).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(400); } return false; }
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };

(async () => {
  execSync(`${S}/servers.sh both`, { stdio: 'pipe' });
  q('nokau_test', "delete from auth_throttle; delete from admin_users where email like 'tut.%@nokau.test'");
  q('nokau_test', `insert into admin_users (email, password_hash, role, name) values ('tut.gerente@nokau.test', '${hashPw('tut-pass-1')}', 'gerente', 'Gerente Tut'), ('tut.garcom@nokau.test', '${hashPw('tut-pass-1')}', 'garcom', 'Garcom Tut')`);
  const synced = await waitFor(() => q('nokau_local', "select count(*) from admin_users where email like 'tut.%@nokau.test'") === '2', 30000);
  q('nokau_local', 'delete from print_jobs; delete from printers; delete from auth_throttle');
  const b = await chromium.launch();
  const login = async (email, base, opts = { viewport: { width: 1366, height: 900 } }) => {
    const ctx = await b.newContext(opts); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${email}@${base}: ${e.message.slice(0, 150)}`));
    await p.goto(base + '/admin/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'tut-pass-1'); await p.click('button[type=submit]');
    await p.waitForURL(/\/admin\/(dashboard|mesas)/, { timeout: 20000 }); return p;
  };

  // ---------- 1. fácil de encontrar ----------
  const g = await login('tut.gerente@nokau.test', C);
  const navLink = g.locator('[data-testid="panel-sidebar"] [data-testid="nav-impressora"]');
  await navLink.waitFor({ timeout: 10000 }).catch(() => {});
  check(await navLink.isVisible() && /Ligar impressora/.test(await navLink.innerText()), '1.1 menu lateral do Gerente: grupo "Ajuda" → "Ligar impressora"');
  await navLink.click(); await g.waitForURL(/\/admin\/ajuda\/impressora/);
  check(await g.locator('[data-testid="printer-tutorial"]').isVisible(), '1.2 abre o tutorial');
  await g.goto(C + '/admin/impressoras', { waitUntil: 'networkidle' });
  check(await g.locator('[data-testid="printer-tutorial-link"]').isVisible(), '1.3 página Impressoras (site na internet): destaque "Primeira vez? Tutorial passo a passo"');
  const w = await login('tut.garcom@nokau.test', C);
  check(await w.locator('[data-testid="nav-impressora"]').count() === 0, '1.4 Garçom não vê o tutorial (não configura impressoras)');
  await w.goto(C + '/admin/ajuda/impressora');
  check(await w.waitForURL(/\/admin\/mesas/, { timeout: 15000 }).then(() => true, () => false), '1.5 Garçom pelo endereço → enviado para Mesas');

  // ---------- 2. conteúdo ----------
  await g.goto(C + '/admin/ajuda/impressora', { waitUntil: 'networkidle' });
  const steps = await g.locator('[data-testid^="step-"]:not([data-testid^="step-done"])').evaluateAll((els) => els.map((e) => e.id));
  check(steps.join(',') === 'antes,ligar,ligacao,painel,papel,teste,dia', `2.1 7 passos pela ordem: ${steps.join(' → ')}`);
  check(await g.locator('[data-testid="tutorial-central-warning"]').isVisible(), '2.2 no site na internet avisa que a impressora se liga no computador do restaurante');
  const imgs = await g.evaluate(() => [...document.querySelectorAll('[data-testid="printer-tutorial"] img')].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })));
  // as imagens carregam de forma preguiçosa: rola até cada uma
  for (const sel of ['impressora-formulario', 'impressora-cartao', 'impressora-fila']) { await g.locator(`img[src*="${sel}"]`).scrollIntoViewIfNeeded(); }
  await sleep(800);
  const loaded = await g.evaluate(() => [...document.querySelectorAll('[data-testid="printer-tutorial"] img')].filter((i) => i.complete && i.naturalWidth > 0).length);
  check(imgs.length === 3 && loaded === 3, `2.3 3 capturas reais do ecrã carregam (${loaded}/${imgs.length})`);
  const svgs = await g.locator('[data-testid="printer-tutorial"] figure [role="img"][aria-label]').count();
  check(svgs >= 11, `2.4 ilustrações com descrição para leitores de ecrã (${svgs})`);
  for (const [k, t] of [['a', 'Rede por cabo'], ['b', 'Wi-Fi'], ['c', 'USB'], ['d', 'Bluetooth']]) check(await g.locator(`#ligacao-${k}`).innerText().then((x) => x.includes(t)), `2.5 instruções para ${t}`);
  check(await g.locator('text=58 mm').first().isVisible() && await g.locator('text=80 mm').first().isVisible(), '2.6 tamanho do papel 58/80 mm explicado');
  // mensagens dos problemas = mensagens REAIS do sistema (sem desvio entre tutorial e código)
  const src = fs.readFileSync((ROOT + '/src/lib/print/transport.ts'), 'utf8') + fs.readFileSync((ROOT + '/src/app/admin/actions.ts'), 'utf8');
  const msgs = await g.locator('[data-testid="problem"] .font-mono').allInnerTexts();
  check(msgs.length >= 3 && msgs.every((m) => src.includes(m)), `2.7 mensagens de erro citadas existem no sistema (${msgs.length})`);
  const probs = g.locator('[data-testid="problem"]');
  check(await probs.count() >= 12, `2.8 ${await probs.count()} problemas comuns com solução`);
  await probs.filter({ hasText: 'acentos' }).first().locator('summary').click();
  check(await probs.filter({ hasText: 'acentos' }).first().locator('text=PC850').isVisible(), '2.9 tocar num problema mostra a solução');
  // botões citados existem mesmo no painel
  const buttons = ['Testar ligação', 'Imprimir teste', 'Editar', 'Tentar de novo', 'Imprimir de novo', 'Reimprimir', 'Adicionar impressora', 'Imprimir no talão'];
  const ui = fs.readFileSync((ROOT + '/src/components/admin/PrintersManager.tsx'), 'utf8') + fs.readFileSync((ROOT + '/src/components/receipt/ThermalPrintButton.tsx'), 'utf8');
  check(buttons.every((x) => ui.includes(x)), '2.10 todos os botões referidos no tutorial existem no painel');

  // ---------- 3. lista de passos feitos ----------
  await g.locator('[data-testid="step-done-ligar"]').click();
  await g.locator('[data-testid="step-done-papel"]').click();
  check(/2 de 7/.test(await g.locator('[data-testid="tutorial-progress"]').innerText()), '3.1 "Marcar como feito" → progresso 2 de 7');
  await g.reload({ waitUntil: 'networkidle' });
  check(/2 de 7/.test(await g.locator('[data-testid="tutorial-progress"]').innerText()) && (await g.locator('[data-testid="step-done-ligar"]').getAttribute('aria-pressed')) === 'true', '3.2 o progresso fica guardado neste aparelho');
  await g.locator('[data-testid="step-done-papel"]').click();
  check(/1 de 7/.test(await g.locator('[data-testid="tutorial-progress"]').innerText()), '3.3 desmarcar funciona');

  // ---------- 4. seguir o tutorial no computador do restaurante, até imprimir ----------
  check(synced, '4.0 conta do gerente disponível no servidor local');
  const printer = await startFakePrinter(19100);
  const lp = await login('tut.gerente@nokau.test', L);
  await lp.goto(L + '/admin/ajuda/impressora', { waitUntil: 'networkidle' });
  check(await lp.locator('text=Está no painel do computador do restaurante').isVisible() && await lp.locator('[data-testid="tutorial-central-warning"]').count() === 0, '4.1 no computador do restaurante: "Pode seguir todos os passos"');
  const drawn = (await lp.locator('[aria-label="Talão de teste em papel de 80 mm"] svg text').evaluateAll((els) => els.map((e) => e.textContent))).map((t) => t.trim()).filter(Boolean);
  await lp.locator('[data-testid="panel-sidebar"] [data-testid="nav-impressoras"]').click();
  await lp.waitForURL(/\/admin\/impressoras/);
  check(await lp.locator('[data-testid="printer-tutorial-link"]').isVisible() && await lp.getByRole('link', { name: 'tutorial passo a passo', exact: true }).isVisible(), '4.2 Impressoras (local): destaque do tutorial e link na lista vazia');
  const form = lp.locator('[data-testid="printer-form-new"]');
  await form.locator('input[name=name]').fill('Cozinha');
  await form.locator('select[name=connection]').selectOption('network');
  await form.locator('input[name=host]').fill('127.0.0.1'); await form.locator('input[name=port]').fill('19100');
  await form.locator('select[name=paperWidth]').selectOption('80'); await form.locator('select[name=codepage]').selectOption('cp860');
  await form.getByRole('button', { name: 'Adicionar impressora' }).click();
  const card = lp.locator('li[data-testid^="printer-"]').first();
  await card.waitFor({ timeout: 15000 });
  await card.getByRole('button', { name: 'Testar ligação' }).click();
  check(await waitFor(() => card.locator('[data-testid="printer-msg"]').innerText().then((t) => t === 'Ligação OK. Papel OK.'), 15000), '4.3 passo 6: "Testar ligação" → "Ligação OK. Papel OK." (como no tutorial)');
  await card.getByRole('button', { name: 'Imprimir teste' }).click();
  check(await waitFor(() => printer.jobs.length > 0, 20000), '4.4 "Imprimir teste" → o talão chega à impressora');
  const real = (printer.jobs[0]?.tickets?.[0]?.lines ?? []).map((t) => t.trim()).filter(Boolean);
  const norm = (l) => l.replace(/^Data: .*/, 'Data').replace(/^Ligacao: .*/, 'Ligacao').replace(/^Impressora: .*/, 'Impressora');
  check(real.length > 0 && JSON.stringify(real.map(norm)) === JSON.stringify(drawn.filter((t) => t !== '✂').map(norm)),
    `4.5 o talão desenhado no tutorial = o talão real, linha a linha (${real.length} linhas)`);
  if (real.length && JSON.stringify(real.map(norm)) !== JSON.stringify(drawn.filter((t) => t !== '✂').map(norm))) console.log('real:', real, '\ndesenho:', drawn);
  await printer.close();

  // ---------- 5. telemóvel e tablet ----------
  for (const [name, dev] of [['Android 360', devices['Pixel 7']], ['iPhone SE 320', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }], ['iPad', devices['iPad (gen 7)']]]) {
    const m = await login('tut.gerente@nokau.test', C, dev);
    await m.locator('header [data-testid="menu-button"]').click();
    await m.locator('#painel-menu [data-testid="nav-impressora"]').click();
    await m.waitForURL(/\/admin\/ajuda\/impressora/); await m.waitForLoadState('networkidle');
    const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1, `5.1 ${name}: tutorial pelo menu ☰, sem deslocamento horizontal`);
    const tiny = await m.evaluate(() => [...document.querySelectorAll('[data-testid="printer-tutorial"] p, [data-testid="printer-tutorial"] li')].filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 12).length);
    check(tiny === 0, `5.2 ${name}: texto legível (nenhum parágrafo < 12px)`);
    if (name === 'Android 360') { await m.screenshot({ path: `${S}/tutorial-telemovel.png` }); await m.locator('#teste').scrollIntoViewIfNeeded(); await m.screenshot({ path: `${S}/tutorial-telemovel-teste.png` }); }
    await m.context().close();
  }
  await g.setViewportSize({ width: 1366, height: 900 }); await g.goto(C + '/admin/ajuda/impressora#ligacao', { waitUntil: 'networkidle' }); await g.screenshot({ path: `${S}/tutorial-computador.png` });

  await b.close();
  q('nokau_local', 'delete from print_jobs; delete from printers');
  q('nokau_test', "delete from admin_users where email like 'tut.%@nokau.test'");
  execSync(`${S}/servers.sh stop-local`, { stdio: 'pipe' });
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n').slice(0, 3).join(' | ')); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
