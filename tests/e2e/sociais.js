/* Redes sociais: Instagram, Facebook e TikTok no rodapé (todas as páginas), na página Contacto e nos dados para o Google. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const C = 'http://localhost:3100';
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const EXPECTED = {
  Instagram: 'https://www.instagram.com/nokau.gb/',
  Facebook: 'https://www.facebook.com/share/1T3LR5ewv7/',
  TikTok: 'https://www.tiktok.com/@no_kau',
};

(async () => {
  execSync(`${__dirname}/servers.sh central`, { stdio: 'pipe' });
  const b = await chromium.launch();
  for (const [name, opts] of [['computador', { viewport: { width: 1366, height: 900 } }], ['telemóvel', devices['Pixel 7']]]) {
    const p = await (await b.newContext(opts)).newPage();
    p.on('pageerror', (e) => errs.push(`${name}: ${e.message.slice(0, 150)}`));
    for (const path of ['/', '/menu', '/reservas']) {
      await p.goto(C + path, { waitUntil: 'load' });
      const links = await p.locator('[data-testid="footer-socials"] a').evaluateAll((as) => as.map((a) => ({ t: a.textContent.trim(), href: a.getAttribute('href'), target: a.target, rel: a.rel })));
      const all = Object.entries(EXPECTED).every(([n, u]) => links.some((l) => l.t.startsWith(n) && l.href === u));
      check(all && links.length === 3 && links.every((l) => l.target === '_blank' && /noopener/.test(l.rel)), `1 ${name} ${path}: rodapé com Instagram, Facebook e TikTok (abrem num separador novo)`);
    }
    await p.goto(C + '/contacto', { waitUntil: 'load' });
    for (const [n, u] of Object.entries(EXPECTED)) {
      const l = p.locator(`[data-testid="social-${n.toLowerCase()}"]`);
      check(await l.isVisible() && (await l.getAttribute('href')) === u, `2 ${name} Contacto: ${n} → ${u}`);
    }
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1, `3 ${name} Contacto: sem deslocamento horizontal`);
    const ld = await p.locator('script[type="application/ld+json"]').first().textContent();
    const same = JSON.parse(ld).sameAs ?? [];
    check(Object.values(EXPECTED).every((u) => same.includes(u)), `4 ${name}: dados para o Google (sameAs) com as 3 redes`);
    check(!/_r=1|_t=ZG/.test(await p.content()), `5 ${name}: link do TikTok sem códigos de rastreio`);
  }
  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n')[0]); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
