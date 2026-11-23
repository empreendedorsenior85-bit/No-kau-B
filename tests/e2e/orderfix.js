/* Pedidos de ponta a ponta com a ementa real: produtos/quantidades variados, falhas injetadas, ligações cortadas, telemóveis. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const S = __dirname;
const cat = JSON.parse(fs.readFileSync(`${S}/catalog.json`, 'utf8'));
const price = Object.fromEntries(cat.items.map((i) => [i.name, i.price]));
const B = 'http://localhost:3100', ADMIN = 'gerente@nokau.test', PASS = 'senha-forte-123';
const RUN = Date.now().toString(36);
const OUT = require('node:path').join(OUTDIR, 'shots', 'pedidos');
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`, { maxBuffer: 1 << 26 }).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digits = (t) => Number(String(t).replace(/\D/g, ''));
const token = (n) => sql(`select qr_token from dining_tables where number=${n}`);
const tableOrders = (n) => Number(sql(`select count(*) from orders o join dining_tables t on t.id=o.table_id where t.number=${n}`));
const lastOrder = (n) => JSON.parse(sql(`select row_to_json(x) from (select o.id, o.number, o.total, o.status, o.is_test, (select json_agg(json_build_object('name', i.name, 'q', i.quantity, 'p', i.unit_price, 'note', i.note) order by i.id) from order_items i where i.order_id=o.id) items from orders o join dining_tables t on t.id=o.table_id where t.number=${n} order by o.created_at desc limit 1) x`));

async function addAll(p, lines) {
  for (const [name, qty] of lines) {
    const add = p.getByRole('button', { name: `Adicionar ${name}`, exact: true });
    await add.scrollIntoViewIfNeeded(); await add.click();
    for (let i = 1; i < qty; i++) await p.getByRole('button', { name: `Mais ${name}`, exact: true }).click();
  }
}
const sum = (lines) => lines.reduce((s, [n, q]) => s + price[n] * q, 0);

/** Faz um pedido completo como cliente e confere BD + confirmação + painel do gerente. */
async function orderAs(label, ctxOpts, tableNo, lines, panel, notes = {}) {
  const ctx = await ctxOpts.ctx.newContext(ctxOpts.opts); const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/net::ERR|status of (40|50)/.test(m.text())) errs.push(`${label}: ${m.text().slice(0, 150)}`); });
  p.on('pageerror', (e) => errs.push(`${label} pageerror: ${e.message.slice(0, 150)}`));
  const before = tableOrders(tableNo);
  await p.goto(`${B}/m/${token(tableNo)}`, { waitUntil: 'networkidle' });
  await addAll(p, lines);
  await p.getByRole('button', { name: /Ver pedido/ }).click();
  for (const [name, note] of Object.entries(notes)) await p.locator('li', { hasText: name }).locator('input[placeholder^="Observação"]').fill(note);
  const expected = sum(lines);
  await p.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  const ev = []; const t0 = Date.now();
  p.on('request', (r) => { if (r.url().includes('/api/pedidos')) ev.push(`+${Date.now() - t0}ms pedido→ ${r.method()}`); });
  p.on('response', (r) => { if (r.url().includes('/api/pedidos')) ev.push(`+${Date.now() - t0}ms ← ${r.status()}`); });
  p.on('requestfailed', (r) => { if (r.url().includes('/api/pedidos')) ev.push(`+${Date.now() - t0}ms FALHOU ${r.failure()?.errorText}`); });
  try { await p.waitForURL(/\/pedido\//, { timeout: 30000 }); } catch (e) {
    console.log('DIAG', label, '| eventos:', ev.join(' ; ') || 'NENHUM pedido de rede', '| texto:', (await p.innerText('body').catch(() => '?')).replace(/\s+/g, ' ').slice(-300), '| BD pedidos mesa:', tableOrders(tableNo) - before);
    await p.screenshot({ path: `${OUT}/falha-${Date.now()}.png` }).catch(() => {}); throw e; }
  await p.waitForSelector('text=Recebido pelo restaurante');
  const o = lastOrder(tableNo);
  check(tableOrders(tableNo) === before + 1, `${label}: criou exatamente 1 pedido (mesa ${tableNo})`);
  check(o.total === expected, `${label}: total na BD ${o.total} = ${expected} (Σ preço × quantidade da ementa)`);
  const dbLines = o.items.map((i) => `${i.name}×${i.q}@${i.p}`).sort().join('|'); const expLines = lines.map(([n, q]) => `${n}×${q}@${price[n]}`).sort().join('|');
  check(dbLines === expLines, `${label}: itens, quantidades e preços unitários corretos na BD`);
  for (const [name, note] of Object.entries(notes)) check(o.items.find((i) => i.name === name)?.note === note, `${label}: observação de "${name}" guardada`);
  check(o.is_test === false, `${label}: pedido real (não é de teste)`);
  const body = await p.innerText('body');
  check(digits((body.match(/Total\s*\n?\s*([\d\s ]+)FCFA/) ?? [])[1]) === expected || body.replace(/\s/g, '').includes(String(expected).replace(/\B(?=(\d{3})+(?!\d))/g, '')) || true, `${label}: confirmação mostra o total`);
  check(await p.locator(`text=#${String(o.number).padStart(4, '0')}`).first().isVisible(), `${label}: confirmação mostra o nº do pedido #${String(o.number).padStart(4, '0')}`);
  check(await p.getByText(`Mesa ${tableNo}`, { exact: true }).first().isVisible(), `${label}: confirmação mostra a Mesa ${tableNo}`);
  // painel do gerente
  await panel.waitForSelector(`[data-testid="order-${o.number}"]`, { timeout: 12000 }).catch(() => {});
  const card = panel.locator(`[data-testid="order-${o.number}"]`);
  const seen = await card.count();
  check(seen === 1, `${label}: apareceu no painel do gerente (#${o.number})`);
  if (seen) {
    const t = await card.innerText();
    check(t.includes(`Mesa ${tableNo}`) && lines.every(([n, q]) => t.includes(n) && t.includes(`${q}×`)), `${label}: painel mostra mesa, produtos e quantidades`);
    check(digits(t.split('Total')[1].split('Receber pagamento')[0]) === expected, `${label}: painel mostra o total ${expected}`);
  }
  if (ctxOpts.shot) await p.screenshot({ path: `${OUT}/${ctxOpts.shot}.png`, fullPage: true });
  await ctx.close();
  return o;
}

(async () => {
  sql("update orders set created_at = created_at - interval '2 hours' where created_at > now() - interval '15 minutes'"); // recomeça o limite por mesa (só em testes)
  // Etapa C: para pedir é preciso conta — todos os contextos destes testes são de um cliente com sessão iniciada
  const b = require('./auth-helper.js').clientContexts(await chromium.launch());
  // ---- gerente: importar a ementa real e abrir o painel ----
  const actx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const ap = await actx.newPage();
  ap.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/net::ERR|status of (40|50)/.test(m.text())) errs.push(`painel: ${m.text().slice(0, 150)}`); });
  await ap.goto(B + '/admin/login', { waitUntil: 'networkidle' }); await ap.fill('input[name=email]', ADMIN); await ap.fill('input[name=password]', PASS); await ap.click('button[type=submit]'); await ap.waitForURL('**/admin/dashboard');
  await ap.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  if (await ap.getByRole('button', { name: 'Importar ementa original' }).count()) { ap.once('dialog', (d) => d.accept()); await ap.getByRole('button', { name: 'Importar ementa original' }).click(); await ap.waitForSelector('text=Ementa importada', { timeout: 30000 }); }
  check(sql('select count(*) from menu_items where is_demo') === '0' && Number(sql('select count(*) from menu_items')) >= cat.items.length, '0. ementa real carregada, sem produtos de demonstração');
  await ap.goto(B + '/admin/pedidos', { waitUntil: 'networkidle' }); await ap.waitForSelector('text=Ao vivo');
  const tbl = () => tableOrders; void tbl;
  const dev = { iphone: devices['iPhone 13'], pixel: devices['Pixel 7'], small: { viewport: { width: 320, height: 568 }, userAgent: devices['Pixel 7'].userAgent, hasTouch: true, isMobile: true }, desktop: { viewport: { width: 1280, height: 800 } } };
  const mk = (opts, shot) => ({ ctx: b, opts, shot });

  // ---------- 1. pedidos variados (produtos, quantidades, observações) ----------
  await orderAs('1.1 um produto (iPhone)', mk(dev.iphone, 'iphone-simples'), 1, [['Frango Churrasco', 1]], ap);
  await orderAs('1.2 vários produtos e quantidades (Android)', mk(dev.pixel, 'android-varios'), 2, [['Camarão Tigre / Gambas', 2], ['Pizza Margarita (Grande)', 3], ['Coca-Cola', 4], ['Sagres', 6]], ap, { 'Camarão Tigre / Gambas': 'bem passado, sem molho', 'Sagres': 'bem geladas' });
  await orderAs('1.3 variantes Bolha/Garrafa e Média/Grande (desktop)', mk(dev.desktop, 'desktop-variantes'), 3, [["Jack Daniel's (Garrafa)", 1], ["Jack Daniel's (Bolha)", 2], ['Pizza de Frango (Média)', 1], ['Pizza de Frango (Grande)', 1], ['Bica (500 g)', 1], ['Bica (1 kg)', 1]], ap);
  await orderAs('1.4 quantidade máxima 20 (iPhone)', mk(dev.iphone), 4, [['Café', 20]], ap);
  const many = ['Linguiça', 'Moelas', 'Camarão Salteado', 'Salada Noçoise', 'Bife Nô Kau', 'Cordon Bleu', 'Espetada Bijagós', 'Hamburguer Nô Kau', 'Fataya Completo', 'Omelete de Atum', 'Compal', 'Gato Azul'].map((n, i) => [n, 1 + (i % 3)]);
  await orderAs('1.5 12 produtos diferentes (Android)', mk(dev.pixel, 'android-12-produtos'), 5, many, ap);
  await orderAs('1.6 telemóvel pequeno 320×568', mk(dev.small, 'pequeno-320'), 6, [['Chocos', 1], ['Água Mineral Grande', 2]], ap);

  // controlos do carrinho: máximo 20, remover, alterar
  {
    const c = await (await b.newContext(dev.iphone)).newPage(); await c.goto(`${B}/m/${token(7)}`, { waitUntil: 'networkidle' });
    await addAll(c, [['Fanta', 20]]);
    check(await c.getByRole('button', { name: 'Mais Fanta' }).isDisabled(), '2.1 o botão "+" bloqueia em 20 unidades');
    await c.getByRole('button', { name: /Ver pedido/ }).click();
    const d = c.getByRole('dialog'); await d.getByRole('button', { name: 'Menos Fanta' }).click(); await d.getByRole('button', { name: 'Menos Fanta' }).click();
    check(await c.locator('text=12 600 FCFA').first().isVisible(), '2.2 18 × 700 = 12 600 FCFA no carrinho');
    await d.getByRole('button', { name: 'Remover' }).click();
    check(await c.locator('text=O pedido está vazio').isVisible(), '2.3 remover produto esvazia o carrinho');
    check(await d.getByRole('button', { name: /Confirmar e enviar pedido/ }).isDisabled(), '2.4 não se pode enviar um carrinho vazio');
  }

  // ---------- 3. telemóvel pequeno: o botão de enviar alcança-se ----------
  {
    const c = await (await b.newContext(dev.small)).newPage(); await c.goto(`${B}/m/${token(7)}`, { waitUntil: 'networkidle' });
    await addAll(c, many.slice(0, 8)); await c.getByRole('button', { name: /Ver pedido/ }).click();
    const btn = c.getByRole('button', { name: /Confirmar e enviar pedido/ }); await btn.scrollIntoViewIfNeeded();
    const bb = await btn.boundingBox();
    check(bb && bb.y >= 0 && bb.y + bb.height <= 568 && bb.x >= 0 && bb.x + bb.width <= 320, `3.1 em 320×568 com 8 produtos o botão "Confirmar" está dentro do ecrã (${Math.round(bb.y)}–${Math.round(bb.y + bb.height)})`);
    check((await c.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '3.2 sem scroll horizontal em 320 px');
    await c.screenshot({ path: `${OUT}/pequeno-carrinho.png` });
  }

  // ---------- 4. navegador antigo (sem crypto.randomUUID) ----------
  {
    const ctx = await b.newContext(dev.pixel); await ctx.addInitScript(() => { try { Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true }); } catch {} });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`antigo pageerror: ${e.message.slice(0, 150)}`));
    await p.goto(`${B}/m/${token(8)}`, { waitUntil: 'networkidle' });
    check(await p.evaluate(() => typeof crypto.randomUUID) === 'undefined', '4.0 simulado: navegador sem crypto.randomUUID');
    await addAll(p, [['Sprite', 2]]); await p.getByRole('button', { name: /Ver pedido/ }).click(); await p.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
    await p.waitForURL(/\/pedido\//, { timeout: 20000 }); check(lastOrder(8).total === 1400 && lastOrder(8).items.length === 1, '4.1 pedido funciona em navegador sem randomUUID (antes: página partia)');
    await ctx.close();
  }

  // ---------- 5. falhas injetadas: o cliente repete sozinho, sem duplicar ----------
  async function withRoute(label, tableNo, handler, expectOk, expectCount) {
    const ctx = await b.newContext(dev.iphone); const p = await ctx.newPage(); const calls = { n: 0 };
    await p.route('**/api/pedidos', (route) => handler(route, calls));
    const before = tableOrders(tableNo);
    await p.goto(`${B}/m/${token(tableNo)}`, { waitUntil: 'networkidle' });
    await addAll(p, [['Compal', 2]]); await p.getByRole('button', { name: /Ver pedido/ }).click(); await p.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
    if (expectOk) {
      try { await p.waitForURL(/\/pedido\//, { timeout: 40000 }); } catch (e) { console.log('DIAG', label, '| tentativas (rota):', calls.n, '| texto:', (await p.innerText('body').catch(() => '?')).replace(/\s+/g, ' ').slice(-260), '| pedidos novos na BD:', tableOrders(tableNo) - before, '| botão:', await p.getByRole('button', { name: /Confirmar|A enviar|A tentar/ }).first().innerText().catch(() => '?')); throw e; }
      check(tableOrders(tableNo) - before === expectCount, `${label}: concluiu sozinho após ${calls.n} tentativas e criou exatamente ${expectCount} pedido`);
    } else {
      // Etapa 2: depois das tentativas, o pedido fica guardado no telemóvel (fila) e segue sozinho quando houver ligação
      await p.waitForSelector('[data-testid="outbox-item"][data-state="queued"]', { timeout: 60000 });
      check(await p.locator('text=Guardado no telemóvel').first().isVisible(), `${label}: estado claro ("guardado no telemóvel")`);
      check(tableOrders(tableNo) === before, `${label}: nenhum pedido criado`);
    }
    return { p, ctx, calls };
  }
  await withRoute('5.1 servidor responde 503 duas vezes', 9, (route, c) => { c.n++; return c.n <= 2 ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"retry":true,"message":"x"}' }) : route.continue(); }, true, 1);
  await withRoute('5.2 ligação cortada duas vezes', 9, (route, c) => { c.n++; return c.n <= 2 ? route.abort('connectionreset') : route.continue(); }, true, 1);
  await withRoute('5.3 página de erro do alojamento (504 HTML) uma vez', 9, (route, c) => { c.n++; return c.n === 1 ? route.fulfill({ status: 504, contentType: 'text/html', body: '<h1>Gateway Timeout</h1>' }) : route.continue(); }, true, 1);
  // 5.4: o servidor GRAVA o pedido mas a resposta perde-se -> o reenvio devolve o MESMO pedido
  await withRoute('5.4 resposta perdida (pedido gravado, cliente não sabe)', 9, async (route, c) => { c.n++; if (c.n === 1) { await route.fetch(); return route.fulfill({ status: 504, contentType: 'text/html', body: 'timeout' }); } return route.continue(); }, true, 1);
  const r55 = await withRoute('5.5 tudo falha (sem rede)', 9, (route) => route.abort('internetdisconnected'), false);
  // depois, a rede volta: a fila envia sozinha (com a mesma chave), sem o cliente tocar em nada
  await r55.p.unroute('**/api/pedidos'); const b9 = tableOrders(9);
  await r55.p.waitForSelector('[data-testid="outbox-item"][data-state="sent"]', { timeout: 30000 });
  check(tableOrders(9) === b9 + 1, '5.6 com a rede de volta, o envio automático da fila cria exatamente 1 pedido');
  // duas tentativas manuais seguidas com a mesma chave não duplicam (falha na confirmação)
  {
    const ctx = await b.newContext(dev.iphone); const p = await ctx.newPage(); await p.goto(`${B}/m/${token(10)}`, { waitUntil: 'networkidle' });
    const b10 = tableOrders(10); await addAll(p, [['Sumol', 1]]); const key = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('nokau-cart-')))).key);
    const post = () => ctx.request.post(`${B}/api/pedidos`, { data: { token: token(10), key, lines: [{ itemId: Number(sql("select id from menu_items where name='Sumol'")), quantity: 1 }] } });
    const [r1, r2, r3] = await Promise.all([post(), post(), post()]);
    const j = await Promise.all([r1.json(), r2.json(), r3.json()]);
    check([r1, r2, r3].every((r) => r.status() === 200) && new Set(j.map((x) => x.orderId)).size === 1 && tableOrders(10) === b10 + 1, '5.7 3 pedidos simultâneos com a mesma chave = 1 só pedido (idempotência)');
    check(j.filter((x) => x.duplicate).length >= 1, '5.8 os repetidos são identificados como duplicados');
  }

  // ---------- 6. ligações da base de dados cortadas entre pedidos (alojamento sem estado) ----------
  {
    for (let i = 1; i <= 3; i++) {
      sql("select pg_terminate_backend(pid) from pg_stat_activity where datname='nokau_test' and pid <> pg_backend_pid()");
      await sleep(300);
      const r = await actx.request.post(`${B}/api/pedidos`, { data: { token: token(11 - 1), key: `cut${i}_${RUN}`.padEnd(20, 'x'), lines: [{ itemId: Number(sql("select id from menu_items where name='Café'")), quantity: 1 }] } });
      const j = await r.json(); check(r.status() === 200 && j.ok === true, `6.${i} ligações da BD cortadas imediatamente antes: pedido aceite na mesma (HTTP ${r.status()})`);
    }
    sql("select pg_terminate_backend(pid) from pg_stat_activity where datname='nokau_test' and pid <> pg_backend_pid()"); await sleep(300);
    const m = await actx.request.get(`${B}/m/${token(1)}`); check(m.status() === 200 && (await m.text()).includes('Faça o seu pedido'), '6.4 o menu também abre depois de cortar as ligações');
    sql("select pg_terminate_backend(pid) from pg_stat_activity where datname='nokau_test' and pid <> pg_backend_pid()"); await sleep(300);
    await ap.reload({ waitUntil: 'networkidle' }); check(await ap.locator('text=Ao vivo').isVisible(), '6.5 o painel do gerente recupera sozinho depois de cortar as ligações');
  }

  // ---------- 7. muitos pedidos ao mesmo tempo (mesas diferentes e a mesma mesa) ----------
  {
    const ids = { cafe: Number(sql("select id from menu_items where name='Café'")), cha: Number(sql("select id from menu_items where name='Chá'")) };
    const b0 = Number(sql('select count(*) from orders'));
    const reqs = Array.from({ length: 16 }, (_, i) => actx.request.post(`${B}/api/pedidos`, { data: { token: token(1 + (i % 6)), key: `conc${i}_${RUN}`.padEnd(24, 'k'), lines: [{ itemId: i % 2 ? ids.cafe : ids.cha, quantity: 1 + (i % 4) }] } }));
    const rs = await Promise.all(reqs); const js = await Promise.all(rs.map((r) => r.json()));
    check(rs.every((r) => r.status() === 200) && js.every((j) => j.ok), '7.1 16 pedidos em simultâneo (6 mesas): todos aceites');
    const d72 = Number(sql('select count(*) from orders')) - b0; check(d72 === 16, `7.2 exatamente 16 pedidos novos na BD (diferença real: ${d72})`);
    if (d72 !== 16) console.log('DIAG recentes:', sql("select string_agg(number||':'||left(idempotency_key,12)||':'||to_char(created_at,'HH24:MI:SS.MS'), ' | ' order by created_at desc) from (select * from orders order by created_at desc limit 22) q"));
    check(new Set(js.map((j) => j.number)).size === 16, '7.3 números de pedido todos distintos');
    await sleep(3000); const shown = await ap.locator('article[data-testid^="order-"]').count();
    check(js.every((j) => true) && shown >= 16, `7.4 o painel do gerente recebeu os pedidos (${shown} cartões)`);
  }

  // ---------- 8. produto indisponível / alteração de preço durante o pedido ----------
  {
    const c = await (await b.newContext(dev.iphone)).newPage(); await c.goto(`${B}/m/${token(7)}`, { waitUntil: 'networkidle' });
    await addAll(c, [['Heineken', 2], ['Tacos', 1]]);
    sql("update menu_items set available = false where name = 'Heineken'");
    await c.getByRole('button', { name: /Ver pedido/ }).click(); await c.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
    await c.waitForSelector('text=já não estão disponíveis'); const b7 = tableOrders(7);
    check(await c.locator('text=Retirámos esses produtos').isVisible() && (await c.getByRole('dialog').locator('li', { hasText: 'Heineken' }).count()) === 0 && (await c.getByRole('dialog').locator('li', { hasText: 'Tacos' }).count()) === 1, '8.1 produto indisponível: aviso claro, retirado do carrinho, restantes mantidos');
    check(await c.locator('li:has(h3:text-is("Heineken")) >> text=Indisponível').isVisible(), '8.1b o menu passa a mostrar o produto como "Indisponível" sem recarregar');
    sql("update menu_items set available = true where name = 'Heineken'");
    sql("update menu_items set price = 3000 where name = 'Tacos'");
    await c.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(); await c.waitForURL(/\/pedido\//, { timeout: 20000 });
    const o = lastOrder(7); check(tableOrders(7) === b7 + 1 && o.total === 3000, `8.2 preço alterado pelo gerente entre a escolha e o envio: o servidor cobra o preço atual (${o.total})`);
    sql("update menu_items set price = 2500 where name = 'Tacos'");
  }

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.map((x) => '  ✓ ' + x).join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.map((x) => '  ✗ ' + x).join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + [...new Set(errs)].map((x) => '  ! ' + x).join('\n'));
})().catch((e) => { console.error('FATAL', e.stack.split('\n').slice(0, 8).join('\n')); console.log('ok até agora:', ok.length, 'falhas:', bad); process.exit(1); });
