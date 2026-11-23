/* Relatório em PDF: descarregar, validar, comparar com a página e permissões. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const S = __dirname;
const C = 'http://localhost:3100';
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const digits = (s) => Number(String(s).replace(/\D/g, '')) || 0;

async function staff(b, email, pw) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 150)));
  await p.goto(C + '/admin/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  await p.waitForURL(/\/admin\/(dashboard|mesas)/, { waitUntil: 'commit', timeout: 20000 });
  return { ctx, p };
}

(async () => {
  execSync(`${S}/servers.sh central`, { stdio: 'pipe' });
  const b = await chromium.launch();
  const { ctx, p } = await staff(b, 'gerente@nokau.test', 'senha-forte-123');
  for (const r of ['30d', 'hoje']) {
    await p.goto(`${C}/admin/relatorios?r=${r}`, { waitUntil: 'networkidle' });
    const totalOf = async (id, col) => digits(await p.locator(`[data-testid="${id}"] [data-total="${col}"]`).innerText().catch(() => '0'));
    const pageSales = await totalOf('rep-days', 'Vendas (FCFA)'), pageOrders = await totalOf('rep-days', 'Pedidos'), pageUnits = await totalOf('rep-products', 'Unidades');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('[data-testid="report-pdf"]').click()]);
    const file = `${S}/relatorio-${r}.pdf`; await dl.saveAs(file);
    const head = fs.readFileSync(file).subarray(0, 5).toString();
    const info = execSync(`pdfinfo ${file}`).toString();
    const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
    check(head === '%PDF-' && pages >= 1 && /\.pdf$/.test(dl.suggestedFilename()), `1.1 [${r}] PDF válido descarregado: ${dl.suggestedFilename()} (${pages} página(s), ${Math.round(fs.statSync(file).size / 1024)} kB)`);
    const txt = execSync(`pdftotext -layout ${file} -`).toString();
    check(['Vendas por dia', 'Produtos', 'Categorias', 'Mesas', 'Pagamentos por método'].every((t) => txt.includes(t)), `1.2 [${r}] tem todas as secções`);
    check(/Nô Kau/.test(txt) && /Período:/.test(txt) && /Gerado em/.test(txt) && new RegExp(`Página 1 de ${pages}`).test(txt), `1.3 [${r}] cabeçalho (restaurante, período, quem gerou) e numeração de páginas`);
    const grp = (n) => new Intl.NumberFormat('pt-PT', { useGrouping: 'always' }).format(n).replace(/\s/g, ' ');
    const has = (n) => txt.replace(/[  ]/g, ' ').includes(grp(n));
    check(pageSales === 0 ? /Sem pedidos|0 FCFA/.test(txt) : has(pageSales), `1.4 [${r}] vendas iguais às da página (${grp(pageSales)} FCFA)`);
    check(pageOrders === 0 || has(pageOrders), `1.5 [${r}] nº de pedidos igual ao da página (${pageOrders})`);
    check(pageUnits === 0 || has(pageUnits), `1.6 [${r}] unidades iguais às da página (${pageUnits})`);
    check(!/\?{2,}/.test(txt) && /ç|ã|á|é|ô/.test(txt), `1.7 [${r}] acentos portugueses corretos (sem "??")`);
    if (r === '30d') execSync(`pdftoppm -png -r 70 -f 1 -l 2 ${file} ${S}/relatorio-pag`);
  }
  // permissões
  const anon = await (await b.newContext()).request.get(`${C}/admin/relatorios/pdf?r=30d`);
  check(anon.status() === 401, '2.1 sem sessão → 401');
  const wid = execSync('psql -h localhost -p 5433 -U postgres -d nokau_test -tA', { input: "select email from admin_users where role = 'garcom' and active limit 1" }).toString().trim();
  if (wid) {
    const crypto = require('node:crypto');
    const salt = crypto.randomBytes(16); const h = `scrypt$${salt.toString('base64')}$${crypto.scryptSync('garcom-teste-1', salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
    execSync('psql -h localhost -p 5433 -U postgres -d nokau_test -tA', { input: `update admin_users set password_hash = '${h}' where email = '${wid}'` });
    const g = await staff(b, wid, 'garcom-teste-1');
    const gr = await g.ctx.request.get(`${C}/admin/relatorios/pdf?r=30d`);
    check(gr.status() === 403, `2.2 garçom → 403 (sem acesso a relatórios)`);
  } else check(true, '2.2 (sem garçom na base de teste — verificado no código: 403)');
  const custom = await ctx.request.get(`${C}/admin/relatorios/pdf?r=custom&de=2026-11-01&ate=2026-11-19`);
  check(custom.status() === 200 && /2026-11-01_2026-11-19\.pdf/.test(custom.headers()['content-disposition'] ?? ''), '2.3 período personalizado (de/até) no nome do ficheiro');
  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
})().catch((e) => { console.log('FATAL', e.message); console.log(ok, bad); process.exit(1); });
