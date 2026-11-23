/* Navegação móvel uniforme: menu lateral ☰ em todos os perfis (Admin, Gerente, Garçom, Cliente) e no site, em vários ecrãs. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium } = require('playwright');
const { execSync } = require('node:child_process'); const crypto = require('node:crypto');
const S = __dirname;
const AUTH = require(`${S}/auth-helper.js`); const C = 'http://localhost:3100';
const cq = (s) => execSync('psql -h localhost -p 5433 -U postgres -d nokau_test -tA -q', { input: s }).toString().trim();
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ALL = ['Visão geral', 'Pedidos', 'Mesas', 'Reservas', 'Atendimento', 'Pagamentos', 'Clientes', 'Menu', 'Estoque', 'Relatórios', 'Recibos', 'Impressoras', 'QR Codes', 'Garçons', 'Utilizadores', 'Atividade', 'A minha conta', 'Ligar impressora'];
const ROLES = {
  admin: ALL,
  gerente: ALL.filter((x) => !['Recibos', 'Utilizadores', 'Atividade'].includes(x)),
  garcom: ['Pedidos', 'Mesas', 'A minha conta'],
};
const CLIENT = ['Resumo', 'As minhas reservas', 'Pagamentos e recibos', 'Os meus pedidos', 'Reservar mesa', 'Ver o menu', 'Página inicial'];
const SITE = ['Início', 'Menu', 'Cultura', 'Eventos', 'Sobre nós', 'Contacto', 'Reservar mesa', 'Entrar Conta · reservas · equipa'];
const VIEWPORTS = [
  ['Android pequeno 320×568', { width: 320, height: 568 }, true],
  ['Android 360×780', { width: 360, height: 780 }, true],
  ['iPhone 390×844', { width: 390, height: 844 }, true],
  ['telemóvel deitado 780×360', { width: 780, height: 360 }, true],
  ['iPad vertical 768×1024', { width: 768, height: 1024 }, true],
  ['tablet 820×1180', { width: 820, height: 1180 }, true],
  ['iPad horizontal 1024×768', { width: 1024, height: 768 }, false],
  ['computador 1366×900', { width: 1366, height: 900 }, false],
];

const overflowX = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function drawerReport(p, sel, vw, vh) {
  return p.evaluate(({ sel, vw, vh }) => {
    const d = document.querySelector(sel); if (!d) return null;
    const r = d.getBoundingClientRect();
    const links = [...d.querySelectorAll('a, button')].filter((a) => a.innerText.trim() && a.getAttribute('data-testid') !== 'drawer-close').map((a) => {
      const span = a.querySelector('span.truncate') || a;
      const ar = a.getBoundingClientRect(); const x = d.querySelector('[data-testid="drawer-close"]'); const xr = x ? x.getBoundingClientRect() : null;
      const overlap = !!xr && a.getAttribute('data-testid') !== 'drawer-close' && !(xr.right <= ar.left || xr.left >= ar.right || xr.bottom <= ar.top || xr.top >= ar.bottom);
      return { t: a.innerText.replace(/\s+\d+$/, '').replace(/\s+/g, ' ').trim(), cut: span.scrollWidth > span.clientWidth + 1 || a.scrollWidth > a.clientWidth + 1, h: ar.height, overlap };
    });
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, inView: r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1, links, scrollable: getComputedStyle(d.querySelector('nav') || d).overflowY };
  }, { sel, vw, vh });
}
async function everyReachable(p, sel, names) {
  // cada opção pode ser alcançada (scroll dentro do menu) e fica inteira dentro do menu
  const res = [];
  for (const n of names) {
    const l = p.locator(`${sel} a, ${sel} button`).filter({ hasText: n }).first();
    if (!(await l.count())) { res.push(`${n}: não existe`); continue; }
    await l.scrollIntoViewIfNeeded();
    const box = await l.boundingBox(); const dbox = await p.locator(sel).boundingBox();
    if (!box || box.y < dbox.y - 1 || box.y + box.height > dbox.y + dbox.height + 1 || box.x < dbox.x - 1 || box.x + box.width > dbox.x + dbox.width + 1) res.push(`${n}: fora do menu`);
  }
  return res;
}

(async () => {
  execSync(`${S}/servers.sh central`, { stdio: 'pipe' });
  cq('delete from auth_throttle');
  cq("delete from admin_users where email like 'nav.%@nokau.test'");
  for (const r of Object.keys(ROLES)) cq(`insert into admin_users (email, password_hash, role, name) values ('nav.${r}@nokau.test', '${hashPw('nav-pass-123')}', '${r}', 'Nav ${r}')`);
  const b = await chromium.launch();

  // ---------- painel: Admin, Gerente, Garçom ----------
  for (const [role, expected] of Object.entries(ROLES)) {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${role}: ${e.message.slice(0, 150)}`));
    await p.goto(C + '/admin/login'); await p.fill('input[name=email]', `nav.${role}@nokau.test`); await p.fill('input[name=password]', 'nav-pass-123'); await p.click('button[type=submit]');
    await p.waitForURL(/\/admin\/(dashboard|mesas)/, { timeout: 20000 });
    for (const [vname, vp, mobile] of VIEWPORTS) {
      await p.setViewportSize(vp);
      await p.goto(C + (role === 'garcom' ? '/admin/pedidos' : '/admin/relatorios'), { waitUntil: 'networkidle' });
      const L = `${role} · ${vname}`;
      check(await overflowX(p) <= 1, `${L}: sem deslocamento horizontal`);
      if (role !== 'garcom') {
        await p.goto(C + '/admin/dashboard', { waitUntil: 'networkidle' });
        check(await overflowX(p) <= 1, `${L}: Visão geral sem deslocamento horizontal`);
        await p.goto(C + '/admin/relatorios', { waitUntil: 'networkidle' });
      }
      if (!mobile) {
        const side = await drawerReport(p, '[data-testid="panel-sidebar"]', vp.width, vp.height);
        const names = side.links.map((x) => x.t);
        check(!(await p.locator('header [data-testid="menu-button"]').isVisible()) && expected.every((n) => names.includes(n)), `${L}: barra lateral fixa com todas as opções do perfil (${expected.length})`);
        continue;
      }
      const btn = p.locator('header [data-testid="menu-button"]');
      check(await btn.isVisible() && !(await p.locator('#painel-menu').isVisible()), `${L}: botão ☰ visível e menu fechado`);
      check(await p.locator('nav[aria-label="Painel (telemóvel)"]').count() === 0, `${L}: sem a faixa horizontal antiga (opções escondidas)`);
      await btn.click();
      await p.waitForFunction(() => { const r = document.querySelector('#painel-menu').getBoundingClientRect(); return r.left >= -1; }, null, { timeout: 3000 });
      const rep = await drawerReport(p, '#painel-menu', vp.width, vp.height);
      const names = rep.links.map((x) => x.t);
      const missing = expected.filter((n) => !names.includes(n));
      const extra = ALL.filter((n) => !expected.includes(n) && names.includes(n));
      check(rep.inView && rep.width >= Math.min(260, vp.width * 0.8) - 2, `${L}: menu lateral abre dentro do ecrã (${Math.round(rep.width)}px)`);
      check(missing.length === 0, `${L}: todas as ${expected.length} opções do perfil no menu${missing.length ? ' — faltam: ' + missing : ''}`);
      check(extra.length === 0, `${L}: sem opções de outros perfis${extra.length ? ' — a mais: ' + extra : ''}`);
      check(rep.links.every((x) => !x.overlap), `${L}: o botão ✕ não tapa nenhuma opção`);
      if (vname.startsWith('Android 360')) await p.screenshot({ path: `${S}/nav/depois-360-${role}.png` });
      if (vname.startsWith('tablet')) await p.screenshot({ path: `${S}/nav/depois-820-${role}.png` });
      check(rep.links.every((x) => !x.cut), `${L}: nenhum texto cortado${rep.links.filter((x) => x.cut).map((x) => ' ' + x.t)}`);
      check(rep.links.filter((x) => expected.includes(x.t)).every((x) => x.h >= 44), `${L}: opções com área de toque ≥ 44px`);
      const unreach = await everyReachable(p, '#painel-menu', [...expected, 'Terminar sessão']);
      check(unreach.length === 0, `${L}: todas as opções e "Terminar sessão" alcançáveis${unreach.length ? ' — ' + unreach : ''}`);
      check(await p.evaluate(() => document.body.style.overflow === 'hidden'), `${L}: página por trás não desliza com o menu aberto`);
      await p.keyboard.press('Escape');
      check(await p.waitForFunction(() => !document.querySelector('#painel-menu').closest('[data-open]').matches('[data-open="true"]'), null, { timeout: 3000 }).then(() => true, () => false)
        && await p.evaluate(() => document.body.style.overflow === ''), `${L}: Esc fecha e liberta a página`);
      // fecha ao tocar fora
      await btn.click(); await sleep(350);
      await p.mouse.click(vp.width - 5, vp.height / 2);
      check(await p.waitForFunction(() => document.querySelector('#painel-menu').closest('[data-open]').dataset.open === 'false', null, { timeout: 3000 }).then(() => true, () => false), `${L}: tocar fora fecha`);
      // fecha no ✕
      await btn.click(); await sleep(350);
      await p.locator('#painel-menu [data-testid="drawer-close"]').click();
      check(await p.waitForFunction(() => document.querySelector('#painel-menu').closest('[data-open]').dataset.open === 'false', null, { timeout: 3000 }).then(() => true, () => false), `${L}: ✕ fecha`);
      // navegar fecha e muda de página (o título da barra superior acompanha)
      await btn.click(); await sleep(350);
      const target = expected.includes('Mesas') ? 'Mesas' : expected[0];
      await p.locator('#painel-menu a').filter({ hasText: target }).first().click();
      await p.waitForURL(/\/admin\/mesas/, { timeout: 15000 });
      check(await p.waitForFunction(() => document.querySelector('#painel-menu').closest('[data-open]').dataset.open === 'false', null, { timeout: 3000 }).then(() => true, () => false)
        && (await p.locator('[data-testid="panel-current"]').innerText()) === 'Mesas', `${L}: escolher uma opção navega, fecha o menu e mostra a página atual`);
      check(await p.locator('#painel-menu [data-testid="nav-mesas"][aria-current="page"]').count() === 1, `${L}: opção atual destacada no menu`);
    }
    // o garçom não chega às páginas de gestão nem pelo endereço
    if (role === 'garcom') {
      await p.goto(C + '/admin/relatorios');
      check(await p.waitForURL(/\/admin\/mesas/, { timeout: 15000 }).then(() => true, () => false) && await p.locator('text=Vendas por dia').count() === 0, 'garcom: Relatórios continua bloqueado pelo endereço (permissões no servidor)');
    }
    await ctx.close();
  }

  // ---------- cliente ----------
  {
    const ctx = await b.newContext(); await AUTH.loginClient(ctx, C); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`cliente: ${e.message.slice(0, 150)}`));
    for (const [vname, vp, mobile] of VIEWPORTS) {
      await p.setViewportSize(vp); await p.goto(C + '/cliente', { waitUntil: 'load' }); await p.waitForSelector('[data-testid="client-profile"]'); await sleep(400);
      const L = `cliente · ${vname}`;
      check(await overflowX(p) <= 1, `${L}: sem deslocamento horizontal`);
      if (!mobile) {
        const side = await drawerReport(p, '[data-testid="client-sidebar"]', vp.width, vp.height);
        check(CLIENT.every((n) => side.links.map((x) => x.t).includes(n)) && side.links.some((x) => x.t === 'Terminar sessão'), `${L}: barra lateral fixa com todas as opções`);
        continue;
      }
      const btn = p.locator('header [data-testid="menu-button"]');
      check(await btn.isVisible() && !(await p.locator('#cliente-menu').isVisible()), `${L}: botão ☰ visível e menu fechado`);
      await btn.click(); await sleep(350);
      const rep = await drawerReport(p, '#cliente-menu', vp.width, vp.height);
      const names = rep.links.map((x) => x.t);
      check(rep.inView && CLIENT.every((n) => names.includes(n)) && rep.links.every((x) => !x.cut), `${L}: menu lateral com todas as opções, sem cortes`);
      check(rep.links.every((x) => !x.overlap), `${L}: o botão ✕ não tapa nenhuma opção`);
      if (vname.startsWith('Android 360')) await p.screenshot({ path: `${S}/nav/depois-360-cliente.png` });
      const unreach = await everyReachable(p, '#cliente-menu', [...CLIENT, 'Terminar sessão']);
      check(unreach.length === 0, `${L}: todas as opções alcançáveis${unreach.length ? ' — ' + unreach : ''}`);
      await p.locator('#cliente-menu a').filter({ hasText: 'Pagamentos e recibos' }).click();
      await sleep(600);
      const y = await p.evaluate(() => document.getElementById('meus-pagamentos').getBoundingClientRect().top);
      check(await p.evaluate(() => document.querySelector('#cliente-menu').closest('[data-open]').dataset.open === 'false') && y >= 0 && y < vp.height, `${L}: "Pagamentos e recibos" fecha o menu e leva à secção`);
    }
    await ctx.close();
  }

  // ---------- site público ----------
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`site: ${e.message.slice(0, 150)}`));
    for (const [vname, vp, mobile] of VIEWPORTS.filter((v) => v[2])) {
      await p.setViewportSize(vp); await p.goto(C + '/', { waitUntil: 'load' });
      const L = `site · ${vname}`;
      check(await overflowX(p) <= 1, `${L}: sem deslocamento horizontal`);
      await p.locator('button[aria-controls="menu-movel"]').click(); await sleep(350);
      const rep = await drawerReport(p, '#menu-movel', vp.width, vp.height);
      check(rep.inView && SITE.every((n) => rep.links.map((x) => x.t.replace(/\s*→$/, '')).includes(n)), `${L}: menu lateral com todas as opções`);
      check(rep.links.every((x) => !x.overlap) && rep.links.every((x) => !x.cut), `${L}: sem sobreposições nem textos cortados`);
      if (vname.startsWith('Android pequeno')) await p.screenshot({ path: `${S}/nav/depois-320-site.png` });
      if (vname.startsWith('Android 360')) await p.screenshot({ path: `${S}/nav/depois-360-site.png` });
      const unreach = await everyReachable(p, '#menu-movel', SITE.map((n) => n.replace(' Conta · reservas · equipa', '')));
      check(unreach.length === 0, `${L}: todas as opções alcançáveis${unreach.length ? ' — ' + unreach : ''}`);
      await p.locator('#menu-movel a').filter({ hasText: 'Cultura' }).click();
      await p.waitForURL(/\/cultura/);
      check(await p.waitForFunction(() => document.querySelector('#menu-movel').closest('[data-open]').dataset.open === 'false', null, { timeout: 3000 }).then(() => true, () => false) && await p.locator('#menu-movel').waitFor({ state: 'hidden', timeout: 2000 }).then(() => true, () => false), `${L}: navegar fecha o menu`);
    }
    await ctx.close();
  }

  await b.close();
  cq("delete from admin_users where email like 'nav.%@nokau.test'");
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n').slice(0, 3).join(' | ')); console.log('falhas:', bad, '\nerros:', errs, '\nok:', ok.length); process.exit(1); });
