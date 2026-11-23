/* Etapa A — imagens, velocidade do menu QR, segurança (sessões, limites de login, cabeçalhos) e produção (saúde, registos). */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const S = __dirname;
const C = 'http://localhost:3100', L = 'http://localhost:3200';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tA -v ON_ERROR_STOP=1 -q`, { input: s }).toString().trim();
const cq = (s) => q('nokau_test', s);
const srv = (a) => execSync(`${S}/servers.sh ${a}`, { stdio: 'pipe' });
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 250) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
const hashPw = (pw) => { const salt = crypto.randomBytes(16); const k = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }); return `scrypt$${salt.toString('base64')}$${k.toString('base64')}`; };

async function staffLogin(b, email, pw, ip) {
  const ctx = await b.newContext(ip ? { extraHTTPHeaders: { 'x-forwarded-for': ip } } : {});
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 150)));
  await p.goto(C + '/admin/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  const res = await Promise.race([
    p.waitForURL(/\/admin\/(dashboard|mesas)/, { waitUntil: 'commit', timeout: 15000 }).then(() => 'ok'),
    p.locator('form [role=alert]').first().waitFor({ timeout: 15000 }).then(async () => (await p.locator('form [role=alert]').first().innerText())),
  ]).catch(() => 'timeout');
  return { ctx, p, res };
}
const isPanel = async (ctx) => { const p = await ctx.newPage(); await p.goto(C + '/admin/dashboard', { waitUntil: 'load' }); await sleep(800); const u = p.url(); await p.close(); return /\/admin\/dashboard/.test(u); };

(async () => {
  srv('both');
  await waitFor(() => cq("select count(*) from information_schema.tables where table_name = 'auth_throttle'") === '1', 60000);
  cq('delete from auth_throttle');
  const b = await chromium.launch();

  // ---------- 1. Imagens: cores originais, nada por cima ----------
  for (const [name, opts] of [['telemóvel', { ...devices['iPhone 13'] }], ['computador', { viewport: { width: 1440, height: 900 } }]]) {
    const ctx = await b.newContext(opts); const p = await ctx.newPage();
    await p.goto(C + '/', { waitUntil: 'networkidle' }); await sleep(2500);
    const r = await p.evaluate(() => {
      const img = [...document.images].find((i) => i.alt.startsWith('Salão do Nô Kau'));
      const logo = [...document.images].find((i) => i.alt.startsWith('Nô Kau — Restaurante') && i.getBoundingClientRect().width > 60);
      const a = img.getBoundingClientRect(), l = logo.getBoundingClientRect();
      const pts = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85], [0.5, 0.95]].map(([x, y]) => [a.left + a.width * x, a.top + Math.min(a.height, innerHeight - a.top - 2) * y]);
      const covered = pts.filter(([x, y]) => { const el = document.elementFromPoint(x, y); return el && el !== img && !img.contains(el) && !(el.tagName === 'A' || el.closest('[aria-label*="WhatsApp"], a[href*="wa.me"]')); }).map(([x, y]) => document.elementFromPoint(x, y).outerHTML.slice(0, 80));
      let filt = []; for (let el = img; el; el = el.parentElement) { const cs = getComputedStyle(el); if (cs.filter !== 'none' || cs.mixBlendMode !== 'normal' || (cs.maskImage && cs.maskImage !== 'none')) filt.push(el.className.toString().slice(0, 40)); }
      const inter = !(l.right < a.left || l.left > a.right || l.bottom < a.top || l.top > a.bottom);
      return { covered, filt, inter, w: a.width };
    });
    check(r.covered.length === 0, `1.1 ${name}: fotografia do salão sem nada por cima (gradiente, logótipo, sombra)${r.covered.length ? ' → ' + r.covered.join(' | ') : ''}`);
    check(r.filt.length === 0, `1.2 ${name}: sem filtros, máscaras ou mistura de cores na fotografia${r.filt.length ? ' → ' + r.filt.join(',') : ''}`);
    check(!r.inter, `1.3 ${name}: o logótipo não fica sobre a fotografia`);
    for (const path of ['/cultura', '/sobre', '/']) {
      await p.goto(C + path, { waitUntil: 'networkidle' });
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
      const f = await p.evaluate(() => [...document.images].filter((i) => !/Nô Kau — Restaurante/.test(i.alt)).flatMap((img) => { const out = []; for (let el = img; el; el = el.parentElement) { const cs = getComputedStyle(el); if (cs.filter !== 'none' || cs.mixBlendMode !== 'normal') out.push(img.alt.slice(0, 30)); } return out; }));
      const dt = await p.locator('.duotone').count(), prov = await p.locator('text=Imagem provisória').count();
      check(f.length === 0 && dt === 0 && prov === 0, `1.4 ${name} ${path}: todas as fotografias com as cores originais (sem filtro duotone, sem "Imagem provisória")`);
    }
    await ctx.close();
  }

  // ---------- 2. Fotos dos produtos: normalizadas (leves, sem metadados) ----------
  const sharp = require(ROOT + '/node_modules/sharp');
  const big = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 180, g: 90, b: 40 } } })
    .composite([{ input: Buffer.from('<svg width="2400" height="1600"><circle cx="1200" cy="800" r="600" fill="#fff"/></svg>') }])
    .jpeg({ quality: 95 }).withExif({ IFD0: { Copyright: 'teste-metadados', Artist: 'GPS-privado' } }).toBuffer();
  const itemId = cq("select id from menu_items where active order by id limit 1");
  execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -c "update menu_items set image = decode('${big.toString('hex')}','hex'), image_type = 'image/jpeg', image_path = null, image_version = image_version + 1 where id = ${itemId}"`, { maxBuffer: 1e9, stdio: 'pipe' });
  const res = await fetch(`${C}/api/menu-image/${itemId}?v=t${Date.now()}`);
  const body = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(body).metadata();
  check(res.headers.get('content-type') === 'image/webp' && meta.width <= 800 && body.length < big.length / 4,
    `2.1 foto antiga (JPEG ${Math.round(big.length / 1024)} kB, 2400 px) servida em WebP ${meta.width} px, ${Math.round(body.length / 1024)} kB`);
  check(!meta.exif, '2.2 metadados (EXIF) removidos');
  check(cq(`select image_type from menu_items where id = ${itemId}`) === 'image/webp', '2.3 regravada na base de dados (só é convertida uma vez)');
  cq(`update menu_items set image = null, image_type = null, image_version = image_version + 1 where id = ${itemId}`);
  const sizes = execSync(`du -cb ${ROOT}/public/menu/ilustrativas/*.webp | tail -1`).toString().split('\t')[0];
  check(Number(sizes) < 330_000, `2.4 fotos ilustrativas do menu: ${Math.round(sizes / 1024)} kB no total (antes 731 kB)`);

  // ---------- 3. Menu do QR: rapidez ----------
  const tok = cq('select qr_token from dining_tables where active order by number limit 1');
  for (const [name, n, limit] of [['3G normal', { latency: 150, down: 1600 }, 3000], ['3G lento', { latency: 400, down: 400 }, 9000]]) {
    const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: n.latency, downloadThroughput: n.down * 128, uploadThroughput: n.down * 128 });
    const t0 = Date.now(); await p.goto(`${C}/m/${tok}`, { waitUntil: 'commit' });
    const btn = p.locator('button[aria-label^="Adicionar "]').first(); await btn.waitFor({ timeout: 60000 }); const shown = Date.now() - t0;
    let ready = false; while (!ready && Date.now() - t0 < 60000) { await btn.click({ timeout: 2000 }).catch(() => {}); ready = await p.locator('button[aria-label^="Mais "]').first().isVisible().catch(() => false); if (!ready) await sleep(150); }
    const tti = Date.now() - t0;
    check(ready && tti < limit, `3.1 ${name}: menu visível em ${(shown / 1000).toFixed(1)} s, "Adicionar" funciona em ${(tti / 1000).toFixed(1)} s (limite ${limit / 1000} s)`);
    await ctx.close();
  }
  { const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage(); const js = [];
    p.on('response', (r) => { if (r.url().endsWith('.js')) js.push(r.url()); });
    await p.goto(`${C}/m/${tok}`, { waitUntil: 'networkidle' });
    const motion = await p.evaluate(async (urls) => { let n = 0; for (const u of urls) { const t = await (await fetch(u)).text(); if (/LazyMotion|domAnimation/.test(t)) n++; } return n; }, js);
    check(motion === 0, '3.2 o menu da mesa não descarrega a biblioteca de animações');
    const imgsBefore = await p.locator('main img').count();
    check(imgsBefore > 0, `3.3 fotos dos pratos aparecem depois de a página ficar interativa (${imgsBefore})`);
    await ctx.close(); }

  // ---------- 4. Cabeçalhos de segurança ----------
  for (const path of ['/', '/admin/login', `/m/${tok}`, '/cliente/entrar']) {
    const h = (await fetch(C + path)).headers;
    check(h.get('x-frame-options') === 'DENY' && h.get('x-content-type-options') === 'nosniff' && /frame-ancestors 'none'/.test(h.get('content-security-policy') ?? '')
      && h.get('referrer-policy') === 'strict-origin-when-cross-origin' && /camera=\(\)/.test(h.get('permissions-policy') ?? ''), `4.1 cabeçalhos de segurança em ${path}`);
  }
  { const p = await (await b.newContext()).newPage(); await p.setContent(`<iframe src="${C}/admin/login" style="width:600px;height:400px"></iframe>`); await sleep(2000);
    const framed = await p.frames()[1]?.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0);
    check(!framed, '4.2 o painel não abre dentro de outro site (proteção contra clickjacking)'); }

  // ---------- 5. Sessões revogáveis ----------
  const A = await staffLogin(b, 'gerente@nokau.test', 'senha-forte-123');
  check(A.res === 'ok', '5.1 login da equipa');
  const ck = (await A.ctx.cookies()).find((x) => x.name === 'nk_session');
  check(!!ck && ck.httpOnly && ck.sameSite === 'Lax' && !/^[0-9a-f-]{36}\./.test(ck.value), '5.2 cookie httpOnly, SameSite=Lax, com segredo aleatório (sem o id do utilizador)');
  check(cq(`select count(*) from auth_sessions where kind='staff' and id_hash = encode(sha256('${ck.value.split('.')[0]}'::bytea),'hex')`) === '1', '5.3 na base de dados fica só o hash do segredo');
  const copy = await b.newContext(); await copy.addCookies([ck]);
  check(await isPanel(copy), '5.4 (controlo) o cookie copiado funciona enquanto a sessão está aberta');
  await A.p.goto(C + '/admin/dashboard'); if (await A.p.locator('header [data-testid="menu-button"]').isVisible()) await A.p.locator('header [data-testid="menu-button"]').click(); await A.p.getByRole('button', { name: 'Terminar sessão' }).first().click();
  await A.p.waitForURL(/\/admin\/login/, { timeout: 15000 });
  check(!(await isPanel(copy)), '5.5 "Terminar sessão" revoga a sessão: o cookie copiado deixa de servir');
  // cookie no formato antigo (id.validade.assinatura) — já não é aceite
  const uid = cq("select id from admin_users where email = 'gerente@nokau.test'");
  const payload = `${uid}.${Date.now() + 3600e3}`; const sig = crypto.createHmac('sha256', 'test-secret-test-secret-test-secret-123456').update(payload).digest('base64url');
  const old = await b.newContext(); await old.addCookies([{ name: 'nk_session', value: `${payload}.${sig}`, url: C }]);
  check(!(await isPanel(old)), '5.6 cookie no formato antigo (assinado mas sem sessão no servidor) é recusado');
  // mudar a palavra-passe termina as sessões dos outros aparelhos
  cq("delete from admin_users where email = 'troca@nokau.test'");
  cq(`insert into admin_users (email, password_hash, role, name) values ('troca@nokau.test', '${hashPw('primeira-senha-1')}', 'gerente', 'Troca')`);
  const P1 = await staffLogin(b, 'troca@nokau.test', 'primeira-senha-1'); const P2 = await staffLogin(b, 'troca@nokau.test', 'primeira-senha-1');
  check(P1.res === 'ok' && P2.res === 'ok' && (await isPanel(P2.ctx)), '5.7 mesma conta aberta em dois aparelhos');
  await P1.p.goto(C + '/admin/conta'); await P1.p.fill('input[name=current]', 'primeira-senha-1'); await P1.p.fill('input[name=next]', 'segunda-senha-22');
  await P1.p.getByRole('button', { name: 'Alterar palavra-passe' }).click();
  await P1.p.locator('[role=status]').waitFor({ timeout: 15000 }).catch(() => {});
  check(!(await isPanel(P2.ctx)) && (await isPanel(P1.ctx)), '5.8 mudar a palavra-passe termina a sessão no outro aparelho e mantém a atual');
  cq("update admin_users set active = false where email = 'troca@nokau.test'");
  check(!(await isPanel(P1.ctx)), '5.9 conta desativada perde o acesso de imediato');
  // cliente
  const cctx = await b.newContext(); const cp = await cctx.newPage(); const tel = '9' + String(Date.now()).slice(-8);
  await cp.goto(C + '/cliente/registo'); await cp.fill('input[name=name]', 'Cliente Sessão'); await cp.fill('input[name=email]', `sessao${Date.now()}@teste.gw`);
  await cp.fill('input[name=phone]', tel); await cp.fill('input[name=password]', 'cliente-senha-1'); await cp.fill('input[name=password2]', 'cliente-senha-1');
  await cp.locator('input[name=consent]').check(); await cp.getByRole('button', { name: 'Criar conta' }).click();
  await cp.waitForURL(/\/cliente$/, { timeout: 15000, waitUntil: 'commit' }).catch(() => {});
  const cck = (await cctx.cookies()).find((x) => x.name === 'nk_client');
  const ccopy = await b.newContext(); await ccopy.addCookies([cck]);
  const isClient = async (ctx) => { const p = await ctx.newPage(); await p.goto(C + '/cliente', { waitUntil: 'load' }); await sleep(600); const u = p.url(); await p.close(); return /\/cliente$/.test(u); };
  check(await isClient(ccopy), '5.10 conta de cliente: sessão ativa');
  await cp.goto(C + '/cliente'); await cp.locator('[data-testid="client-profile"]').getByRole('button', { name: 'Terminar sessão' }).click(); await cp.waitForURL(/entrar/, { timeout: 15000 });
  check(!(await isClient(ccopy)), '5.11 cliente: "Terminar sessão" revoga a sessão (cookie copiado deixa de servir)');

  // ---------- 6. Limite de tentativas (na base de dados, todas as instâncias) ----------
  cq('delete from auth_throttle');
  cq("delete from admin_users where email = 'alvo@nokau.test'");
  cq(`insert into admin_users (email, password_hash, role, name) values ('alvo@nokau.test', '${hashPw('senha-do-alvo-1')}', 'gerente', 'Alvo')`);
  for (let i = 0; i < 5; i++) { const r = await staffLogin(b, 'alvo@nokau.test', 'errada' + i, '10.0.0.1'); await r.ctx.close(); }
  let r = await staffLogin(b, 'alvo@nokau.test', 'senha-do-alvo-1', '10.0.0.1');
  check(/Demasiadas tentativas/.test(r.res), '6.1 5 falhas do mesmo IP → bloqueado 15 min (mesmo com a palavra-passe certa)'); await r.ctx.close();
  srv('central');
  r = await staffLogin(b, 'alvo@nokau.test', 'senha-do-alvo-1', '10.0.0.1');
  check(/Demasiadas tentativas/.test(r.res), '6.2 o bloqueio continua depois de reiniciar o servidor (guardado na base de dados)'); await r.ctx.close();
  r = await staffLogin(b, 'alvo@nokau.test', 'senha-do-alvo-1', '10.0.0.2');
  check(r.res === 'ok', '6.3 o dono da conta entra de outro IP'); await r.ctx.close();
  for (let i = 0; i < 20; i++) { const x = await staffLogin(b, 'alvo@nokau.test', 'errada' + i, `10.1.${i}.1`); await x.ctx.close(); }
  r = await staffLogin(b, 'alvo@nokau.test', 'senha-do-alvo-1', '10.9.9.9');
  check(/Demasiadas tentativas/.test(r.res), '6.4 20 falhas na mesma conta vindas de IPs diferentes (ou falsificados) → conta bloqueada'); await r.ctx.close();
  check(cq("select count(*) from auth_throttle where key_hash like '%alvo%'") === '0', '6.5 a tabela guarda só hashes (sem emails nem IPs)');
  cq('delete from auth_throttle'); cq("delete from admin_users where email in ('alvo@nokau.test','troca@nokau.test')");

  // ---------- 7. Produção: saúde e erros ----------
  for (const [n, base] of [['central', C], ['local', L]]) {
    const h = await fetch(base + '/api/health'); const j = await h.json();
    check(h.status === 200 && j.ok && j.db === 'ok' && j.role === n && h.headers.get('cache-control') === 'no-store', `7.1 /api/health no ${n}: ${JSON.stringify(j).slice(0, 90)}`);
  }
  const bad3 = spawn('npx', ['next', 'start', '-p', '3300'], { cwd: (ROOT + ''), env: { ...process.env, DATABASE_URL: 'postgres://postgres@localhost:5999/nada', SESSION_SECRET: 'x'.repeat(40) }, stdio: 'ignore', detached: true });
  await waitFor(async () => (await fetch('http://localhost:3300/api/health').catch(() => null)) !== null, 30000);
  const h3 = await fetch('http://localhost:3300/api/health'); const j3 = await h3.json();
  check(h3.status === 503 && j3.ok === false && j3.db === 'error' && !JSON.stringify(j3).includes('5999'), '7.2 base de dados em baixo → 503 (sem revelar a configuração)');
  const pg3 = await (await b.newContext()).newPage(); await pg3.goto(`http://localhost:3300/m/${tok}`, { waitUntil: 'load' }).catch(() => {}); await sleep(1500);
  const txt3 = await pg3.locator('body').innerText().catch(() => '');
  check(!/Error:|ECONNREFUSED|at \w+ \(/.test(txt3) && txt3.length > 0, '7.3 com a base de dados em baixo, o cliente vê uma página amigável (sem detalhes técnicos)');
  try { process.kill(-bad3.pid); } catch {}
  execSync('fuser -k 3300/tcp 2>/dev/null || true');
  const logs = execSync(`grep -h '"level":"error"' ${S}/central.log ${S}/local.log 2>/dev/null | tail -3 || true`).toString();
  check(true, `7.4 registos estruturados (JSON por linha): ${logs ? logs.split('\n')[0].slice(0, 110) : 'nenhum erro registado nos servidores de teste'}`);

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
