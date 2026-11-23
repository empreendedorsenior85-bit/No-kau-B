/* Funcionamento offline REAL no telemóvel: Service Worker + IndexedDB, rede desligada pelo navegador. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const B = process.env.BASE || 'http://localhost:3100';
const DBN = process.env.DBN || 'nokau_test';
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d ${DBN} -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 20000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(step); } return false; }

(async () => {
  // Etapa C: para pedir é preciso conta — todos os contextos destes testes são de um cliente com sessão iniciada
  const b = require('./auth-helper.js').clientContexts(await chromium.launch());
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  const watch = (p) => {
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|ERR_FAILED|409|400/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  };
  sql("update menu_items set available = true, active = true where name in ('Frango Churrasco','Moelas','Chouriço','Linguiça')");
  const tok = sql("select qr_token from dining_tables where number = 3");
  const tid = sql("select id from dining_tables where number = 3");
  sql(`delete from orders where table_id = ${tid}`);
  const countT = () => Number(sql(`select count(*) from orders where table_id = ${tid}`));

  // ---------- 1. primeira visita com rede: o menu fica guardado ----------
  let p = await ctx.newPage(); watch(p);
  await p.goto(`${B}/m/${tok}`, { waitUntil: 'networkidle' });
  check(await waitFor(() => p.locator('[data-testid="offline-ready"]').isVisible()), '1.1 "Menu guardado neste telemóvel" aparece (SW ativo e página guardada)');
  const cached = await p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length; return out; });
  check(Object.values(cached).reduce((a, n) => a + n, 0) > 10, `1.2 caches preenchidas: ${JSON.stringify(cached)}`);
  const imgCached = await p.evaluate(async () => !!(await caches.match('/menu/ilustrativas/frango-churrasco.webp', { ignoreVary: true })));
  check(imgCached, '1.3 fotos guardadas (mesmo as ainda não vistas)');

  // ---------- 2. sem internet: recarregar abre o menu guardado ----------
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' });
  check(await p.getByRole('heading', { name: 'Faça o seu pedido' }).isVisible(), '2.1 sem internet: menu abre a partir do telemóvel');
  check(await waitFor(() => p.locator('[data-testid="net-offline"]').isVisible(), 5000), '2.2 aviso "Sem internet" visível');
  const frango = p.locator('img[alt="Frango Churrasco"]');
  await frango.scrollIntoViewIfNeeded();
  check(await waitFor(() => frango.evaluate((e) => e.complete && e.naturalWidth > 0), 5000), '2.3 foto do produto aparece sem internet');
  check(await p.locator('text=17 500 FCFA').first().isVisible(), '2.4 preços visíveis sem internet');
  const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().top < innerHeight).map((i) => i.src));
  check(broken.length === 0, `2.5 nenhuma imagem partida sem internet (logótipo incluído) ${broken.join(',')}`);

  // ---------- 3. pedir sem internet ----------
  await p.getByRole('button', { name: 'Adicionar Frango Churrasco', exact: true }).click();
  await p.getByRole('button', { name: 'Adicionar Moelas', exact: true }).click();
  await p.getByRole('button', { name: /Ver pedido/ }).click();
  await p.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  check(await waitFor(() => p.locator('[data-testid="outbox-item"][data-state="queued"]').isVisible(), 8000), '3.1 pedido guardado no telemóvel ("será enviado automaticamente")');
  check(await p.locator('text=Ver pedido').count() === 0, '3.2 carrinho esvaziado');
  check(countT() === 0, '3.3 nada chegou ao servidor (sem internet de verdade)');
  const rec = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('nokau', 1); r.onsuccess = () => { const q = r.result.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => res(q.result); }; }));
  check(rec.length === 1 && rec[0].state === 'queued' && rec[0].estTotal === 8000, `3.4 IndexedDB tem 1 pedido em fila (8 000 FCFA): ${JSON.stringify(rec.map((r) => [r.state, r.estTotal]))}`);

  // ---------- 4. fechar a página sem rede; voltar com rede → enviado sozinho, sem duplicar ----------
  await p.close();
  await ctx.setOffline(false);
  p = await ctx.newPage(); watch(p);
  await p.goto(`${B}/m/${tok}`, { waitUntil: 'networkidle' });
  check(await waitFor(() => p.locator('[data-testid="outbox-item"][data-state="sent"]').isVisible(), 20000), '4.1 ao voltar a rede: "Recebido pelo restaurante"');
  check(countT() === 1, `4.2 exatamente 1 pedido no servidor (${countT()})`);
  check(sql(`select total from orders where table_id = ${tid}`) === '8000', '4.3 total calculado pelo servidor: 8 000');
  const label = await p.locator('[data-testid="outbox-item"][data-state="sent"]').first().innerText();
  check(/Pedido #\d{4}/.test(label), `4.4 número do pedido mostrado (${label.split('\n')[0]})`);
  await p.reload({ waitUntil: 'networkidle' }); await sleep(1500);
  check(countT() === 1, '4.5 recarregar não reenvia (continua 1)');

  // ---------- 5. rede volta COM a página aberta ----------
  await ctx.setOffline(true);
  await p.getByRole('button', { name: 'Adicionar Chouriço', exact: true }).click();
  await p.getByRole('button', { name: /Ver pedido/ }).click();
  await p.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  check(await waitFor(() => p.locator('[data-testid="outbox-item"][data-state="queued"]').isVisible(), 8000), '5.1 segundo pedido em fila');
  await sleep(1000);
  check(countT() === 1, '5.2 ainda não chegou');
  await ctx.setOffline(false);
  check(await waitFor(() => p.locator('[data-testid="outbox-item"][data-state="queued"]').count().then((n) => n === 0), 20000), '5.3 enviado sozinho quando a rede voltou (sem recarregar)');
  check(countT() === 2, `5.4 2 pedidos no servidor, sem duplicados (${countT()})`);

  // ---------- 6. produto deixou de estar disponível enquanto o pedido esperava ----------
  await ctx.setOffline(true);
  await p.getByRole('button', { name: 'Adicionar Linguiça', exact: true }).click();
  await p.getByRole('button', { name: /Ver pedido/ }).click();
  await p.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await waitFor(() => p.locator('[data-testid="outbox-item"][data-state="queued"]').isVisible(), 8000);
  sql("update menu_items set available = false where name = 'Linguiça' and category_id = 'entradas'");
  await ctx.setOffline(false);
  check(await waitFor(() => p.locator('[data-testid="outbox-item"][data-state="rejected"]').isVisible(), 20000), '6.1 pedido recusado é mostrado claramente');
  const rj = await p.locator('[data-testid="outbox-item"][data-state="rejected"]').innerText();
  check(/não estão disponíveis/.test(rj), `6.2 motivo visível (${rj.split('\n')[0]})`);
  check(countT() === 2, '6.3 recusado não criou pedido');
  await p.getByRole('button', { name: 'Remover da lista' }).click();
  check(await waitFor(() => p.locator('[data-testid="outbox-item"][data-state="rejected"]').count().then((n) => n === 0), 5000), '6.4 "Remover da lista" funciona');
  sql("update menu_items set available = true where name = 'Linguiça'");

  // ---------- 7. estado do pedido abre sem internet ----------
  const oid = sql(`select id from orders where table_id = ${tid} order by created_at limit 1`);
  await p.goto(`${B}/m/${tok}/pedido/${oid}`, { waitUntil: 'networkidle' });
  await sleep(1000);
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' });
  check(await p.locator('text=Frango Churrasco').first().isVisible(), '7.1 página do pedido abre sem internet (última versão guardada)');
  await ctx.setOffline(false);

  // ---------- 8. menu público /menu sem internet ----------
  const q = await ctx.newPage(); watch(q);
  await q.goto(`${B}/menu`, { waitUntil: 'networkidle' });
  await waitFor(() => q.evaluate(async () => !!(await caches.match(location.href, { ignoreVary: true }))), 15000);
  await ctx.setOffline(true);
  await q.reload({ waitUntil: 'load' });
  check(await q.locator('text=Camarão Tigre / Gambas').first().isVisible(), '8.1 menu público abre sem internet');
  // página nunca visitada → página "Sem ligação" da marca
  await q.goto(`${B}/m/tokendesconhecido1234567890abcdef`, { waitUntil: 'load' }).catch(() => {});
  check(await q.locator('text=Sem ligação à internet').isVisible().catch(() => false), '8.2 página não guardada → aviso "Sem ligação" (não ecrã do navegador)');
  await ctx.setOffline(false);

  // ---------- 9. painel nunca fica em cache ----------
  const adminCached = await q.evaluate(async () => { for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (new URL(r.url).pathname.startsWith('/admin')) return true; return false; });
  check(!adminCached, '9.1 nenhuma página do painel guardada no telemóvel');

  await b.close();
  console.log(`OK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
})().catch((e) => { console.log('FATAL', e.message.slice(0, 800)); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
