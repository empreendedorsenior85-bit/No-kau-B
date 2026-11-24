const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const B = 'http://localhost:3100';
const pages = ['/', '/menu', '/reservas', '/cultura', '/eventos', '/sobre', '/contacto'];
const out = require('node:path').join(OUTDIR, 'shots', 'f3');
const errs = [], ok = [];
const check = (c, msg) => (c ? ok : errs).push(msg);

(async () => {
  const b = await chromium.launch();
  const profiles = [
    ['iphone', devices['iPhone 13']],
    ['android', devices['Pixel 7']],
    ['ipad', devices['iPad (gen 7)']],
    ['desktop', { viewport: { width: 1440, height: 900 } }],
  ];
  for (const [pn, opts] of profiles) {
    const ctx = await b.newContext(opts);
    const p = await ctx.newPage();
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`${pn} console ${m.type()}: ${m.text().slice(0, 200)}`); });
    p.on('pageerror', (e) => errs.push(`${pn} pageerror: ${e.message}`));
    for (const path of pages) {
      const r = await p.goto(B + path, { waitUntil: 'networkidle' });
      check(r.status() === 200, `${pn} ${path} status ${r.status()}`);
      await p.waitForTimeout(400);
      const H = await p.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < Math.max(9000, H + 1000); y += 500) { await p.mouse.wheel(0, 500); await p.waitForTimeout(60); }
      await p.waitForTimeout(800);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(sw <= 0, `${pn} ${path} overflow ${sw}px`);
      const hidden = await p.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((e) => getComputedStyle(e).opacity !== '1').length);
      check(hidden === 0, `${pn} ${path} reveals ainda escondidos: ${hidden}`);
      const imgs = await p.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
      check(imgs.length === 0, `${pn} ${path} imagens partidas: ${imgs.join(',')}`);
      const noAlt = await p.evaluate(() => [...document.images].filter((i) => !i.hasAttribute('alt')).length);
      check(noAlt === 0, `${pn} ${path} imagens sem alt: ${noAlt}`);
      const h1 = await p.evaluate(() => document.querySelectorAll('h1').length);
      check(h1 === 1, `${pn} ${path} h1 count ${h1}`);
      if (pn === 'iphone' || pn === 'desktop') {
        const name = path === '/' ? '-home' : path.replace('/', '-');
        await p.screenshot({ path: `${out}/${pn}${name}.png`, fullPage: true });
      }
    }
    await ctx.close();
  }

  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const hrefs = new Set();
  for (const path of pages) {
    await p.goto(B + path);
    (await p.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')))).forEach((h) => hrefs.add(h.split('#')[0]));
  }
  for (const h of hrefs) {
    const r = await p.request.get(B + h);
    check(r.status() === 200, `link ${h} -> ${r.status()}`);
  }
  console.log('links internos verificados:', [...hrefs].join(' '));
  check((await p.request.get(B + '/xyz')).status() === 404, '404 page');
  // /design-system é interno: sem sessão da equipa vai para o login
  await p.goto(B + '/design-system', { waitUntil: 'load' });
  check(new URL(p.url()).pathname === '/admin/login', `/design-system sem sessão → login (${p.url()})`);

  // Reserva: vazio
  await p.goto(B + '/reservas', { waitUntil: 'networkidle' });
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Verifique os campos assinalados.');
  const alerts = await p.$$eval('form [role=alert]', (a) => a.map((x) => x.textContent));
  check(alerts.length >= 4, `reserva vazia mostra erros (${alerts.length}): ${alerts.join(' | ')}`);
  // inválido
  await p.fill('#name', 'Teste Cliente');
  await p.fill('#phone', 'abc');
  await p.fill('#date', '2020-01-01');
  await p.fill('#time', '20:00');
  await p.click('button[type=submit]');
  await p.waitForTimeout(800);
  const a2 = await p.$$eval('[role=alert]', (a) => a.map((x) => x.textContent).join(' | '));
  check(/telefone/i.test(a2) && /passado/i.test(a2), `validação telefone/data: ${a2}`);
  check((await p.inputValue('#name')) === 'Teste Cliente', 'valores preservados após erro');
  // válido — a reserva é GUARDADA (Pendente) e o cliente segue-a pelo link
  const resDate = new Date(Date.now() + 33 * 86_400_000).toISOString().slice(0, 10);
  await p.fill('#phone', '+245 955 123 456');
  await p.fill('#email', `teste3-${Date.now()}@exemplo.test`);
  await p.fill('#date', resDate);
  await p.fill('#time', '20:00');
  await p.fill('#guests', '4');
  await p.fill('#notes', 'Aniversário <script>alert(1)</script>');
  await p.click('button[type=submit]');
  await p.waitForURL(/\/reserva\//, { timeout: 15000, waitUntil: 'commit' }).catch(async (e) => { console.log('DIAG url', p.url(), await p.$$eval('[role=alert],[role=status]', (a) => a.map((x) => x.textContent.slice(0, 120)))); throw e; });
  await p.waitForSelector('[data-testid="reservation-page"]');
  const body = await p.textContent('body');
  check(/Pendente/.test(body) && body.includes('20:00') && /Pessoas\s*4/.test(body.replace(/\s+/g, ' ')), 'reserva guardada: página "Pendente" com hora e pessoas');
  check(body.includes('<script>alert(1)</script>') && (await p.$$('[data-testid="reservation-page"] script')).length === 0, 'XSS: notas mostradas como texto, não executadas');
  check(!/Aprovada/.test(await p.textContent('[data-testid="reservation-status"]')), 'não afirma reserva aprovada antes da decisão do restaurante');

  // Evento privado
  await p.goto(B + '/eventos', { waitUntil: 'networkidle' });
  await p.selectOption('#eventType', 'aniversario');
  await p.fill('#name', 'Ana');
  await p.fill('#phone', '955123456');
  await p.fill('#date', '2026-12-31');
  await p.fill('#guests', '25');
  await p.click('#privados button[type=submit]');
  await p.waitForSelector('text=Falta um passo', { timeout: 8000 }).catch(async (e) => { console.log('DIAG url', p.url(), await p.$$eval('[role=alert],[role=status]', (a) => a.map((x) => x.textContent.slice(0, 120)))); throw e; });
  check((await p.textContent('pre')).includes('Tipo: Aniversário'), 'evento privado: resumo correto');

  // Menu
  // menu REAL (base de dados) — Etapa 1
  const { execSync } = require('node:child_process');
  const dbq = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q}"`).toString().trim();
  await p.goto(B + '/menu?categoria=pizzas', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const sections = await p.$$eval('section[aria-labelledby^="cat-"] h2', (h) => h.map((x) => x.textContent));
  check(sections.length === 1 && sections[0] === 'Pizzas', `menu: link direto para categoria (${sections})`);
  await p.click('button[role=tab]:has-text("Tudo")');
  await p.waitForTimeout(700);
  const nCats = Number(dbq("select count(distinct c.id) from menu_categories c join menu_items i on i.category_id = c.id where c.active and i.active"));
  check((await p.$$('section[aria-labelledby^="cat-"]')).length === nCats, `menu: "Tudo" mostra as ${nCats} categorias reais`);
  await p.fill('input[type=search]', 'xyzxyz');
  await p.waitForTimeout(700);
  check(!!(await p.$('text=Nenhum prato encontrado.')), 'menu: pesquisa sem resultados');
  await p.fill('input[type=search]', 'CAMARAO TIGRE');
  await p.waitForTimeout(700);
  check((await p.$$('h3:has-text("Camarão Tigre / Gambas")')).length === 1, 'menu: pesquisa ignora maiúsculas/acentos');
  check(/17\s500\sFCFA/.test(await p.textContent('main')), 'menu: preço real da base de dados (Camarão Tigre 17 500 FCFA)');

  // Menu móvel
  const m = await b.newContext(devices['iPhone 13']);
  const mp = await m.newPage();
  await mp.goto(B + '/', { waitUntil: 'networkidle' });
  await mp.click('button[aria-controls="menu-movel"]');
  await mp.waitForTimeout(500);
  check(await mp.isVisible('#menu-movel'), 'menu móvel abre');
  await mp.screenshot({ path: `${out}/iphone-menu-aberto.png` });
  await mp.click('#menu-movel >> text=Cultura');
  await mp.waitForURL('**/cultura');
  await mp.waitForTimeout(600);
  check(!(await mp.isVisible('#menu-movel')), 'menu móvel fecha ao navegar');
  check(await mp.evaluate(() => document.body.style.overflow === ''), 'scroll desbloqueado após navegar');
  check(await mp.isVisible('nav[aria-label="Ações rápidas"]'), 'barra de ações visível no telemóvel');

  // Sem JS
  const nj = await b.newContext({ javaScriptEnabled: false });
  const np = await nj.newPage();
  await np.goto(B + '/cultura');
  check((await np.$eval('[data-reveal]', (e) => getComputedStyle(e).opacity)) === '1', 'sem JS: conteúdo visível');

  // SEO
  await p.goto(B + '/');
  const meta = await p.evaluate(() => ({
    t: document.title,
    d: document.querySelector('meta[name=description]')?.content,
    og: document.querySelector('meta[property="og:image"]')?.content,
    ld: !!document.querySelector('script[type="application/ld+json"]'),
    icon: document.querySelector('link[rel=icon]')?.href,
    lang: document.documentElement.lang,
  }));
  check(meta.t && meta.d && meta.og && meta.ld && meta.icon && meta.lang === 'pt-PT', `SEO: ${JSON.stringify(meta)}`);

  await b.close();
  const quiet = /status 200|overflow 0px|escondidos: 0|partidas: $|sem alt: 0|h1 count 1|-> 200/;
  console.log(`\nOK (${ok.length} verificações; mostradas só as funcionais):\n- ` + ok.filter((o) => !quiet.test(o)).join('\n- '));
  console.log(`\nFALHAS (${errs.length}):\n- ` + errs.join('\n- '));
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
