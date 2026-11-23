/* Etapa 5 — impressão automática, ponta a ponta: QR → pedido → gerente aceita → talão na impressora (rede TCP 9100 e USB). */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const { startFakePrinter } = require('./fake-printer.js');
const S = __dirname;
const C = 'http://localhost:3100', L = 'http://localhost:3200';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tAc "${s.replace(/"/g, '\\"')}"`).toString().trim();
const cq = (s) => q('nokau_test', s), lq = (s) => q('nokau_local', s);
const srv = (a) => execSync(`${S}/servers.sh ${a}`, { stdio: 'pipe' });
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 250) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
let kn = 0; const key = () => `printtest${Date.now().toString(36)}${(kn++).toString().padStart(5, '0')}`;
const text = (job) => job.tickets.map((t) => t.lines.join('\n')).join('\n----CORTE----\n');
async function order(base, tok, lines) {
  const r = await fetch(`${base}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: require('./auth-helper.js').clientCookie(base) }, body: JSON.stringify({ token: tok, key: key(), lines }) });
  return r.json();
}

(async () => {
  // ---------- 0. impressoras virtuais ESC/POS (TCP, como impressoras de rede reais) ----------
  const kitchen = await startFakePrinter(19100);
  const counter = await startFakePrinter(19101);
  const usbFile = `${S}/usb-lp0.bin`; fs.writeFileSync(usbFile, '');
  srv('both');
  await waitFor(() => lq("select count(*) from information_schema.tables where table_name = 'print_jobs'") === '1', 30000);
  await waitFor(() => lq("select count(*) from admin_users where email = 'gerente@nokau.test'") === '1', 60000);
  await waitFor(async () => (await fetch(L + '/admin/login')).ok && (await fetch(C + '/admin/login')).ok, 30000);
  lq('delete from print_jobs'); lq('delete from printers');
  // Etapa C: para pedir é preciso conta — todos os contextos são de um cliente com sessão (central e restaurante)
  const AUTH = require('./auth-helper.js');
  const b = AUTH.clientContexts(await chromium.launch(), [C, L]);
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 150)));
  await p.goto(L + '/admin/login'); await p.fill('input[name=email]', 'gerente@nokau.test'); await p.fill('input[name=password]', 'senha-forte-123'); await p.click('button[type=submit]');
  await p.waitForURL(/dashboard/, { waitUntil: 'commit' });

  // ---------- 1. configurar impressoras (cozinha 80 mm, balcão 58 mm) ----------
  await p.goto(L + '/admin/impressoras', { waitUntil: 'load' });
  const drinks = ['refrigerantes-sumos', 'aguas', 'cafe-cha', 'cervejas-cidras', 'whiskies', 'vodkas-tequila', 'gins', 'vermute', 'runs-licores-frizantes', 'vinhos-champagne'];
  const food = lq("select string_agg(id, ',') from menu_categories where active").split(',').filter((c) => !drinks.includes(c));
  async function addPrinter({ name, station, host, port, paper, cats, usb }) {
    const f = p.locator('[data-testid="printer-form-new"]');
    await f.locator('input[name=name]').fill(name);
    await f.locator('select[name=station]').selectOption(station);
    if (usb) { await f.locator('select[name=connection]').selectOption('usb'); await f.locator('input[name=devicePath]').fill(usb); }
    else { await f.locator('input[name=host]').fill(host); await f.locator('input[name=port]').fill(String(port)); }
    await f.locator('select[name=paperWidth]').selectOption(String(paper));
    for (const c of cats) await f.locator(`input[name=categories][value="${c}"]`).check();
    await f.getByRole('button', { name: 'Adicionar impressora' }).click();
    await p.waitForSelector(`text=Impressora “${name}” adicionada`, { timeout: 10000 });
  }
  await addPrinter({ name: 'Cozinha', station: 'kitchen', host: '127.0.0.1', port: 19100, paper: 80, cats: food });
  await addPrinter({ name: 'Balcão', station: 'counter', host: '127.0.0.1', port: 19101, paper: 58, cats: drinks });
  const pk = lq("select id from printers where name = 'Cozinha'"), pc = lq("select id from printers where name = 'Balcão'");
  check(!!pk && !!pc, '1.1 impressoras da cozinha e do balcão configuradas');
  const kcard = p.locator(`[data-testid="printer-${pk}"]`);
  await kcard.getByRole('button', { name: 'Testar ligação' }).click();
  check(await waitFor(() => kcard.locator('[data-testid="printer-msg"]').innerText().then((t) => /Ligação OK\. Papel OK/.test(t)), 10000), '1.2 "Testar ligação": ligada e papel OK (resposta real ao pedido de estado DLE EOT)');
  await kcard.getByRole('button', { name: 'Imprimir teste' }).click();
  check(await waitFor(() => kitchen.jobs.length >= 1, 10000), '1.3 "Imprimir teste" chega à impressora pela rede');
  const tt = kitchen.jobs[kitchen.jobs.length - 1];
  check(tt.errors.length === 0 && tt.codepage === 3 && /TESTE DE IMPRESSAO/.test(text(tt)) && /Nô Kau · Camarão · Ação · Pão/.test(text(tt)) && tt.tickets[0].cut, `1.4 talão de teste: comandos ESC/POS válidos, acentos PC860 certos, corte (${tt.bytes.length} bytes)`);
  kitchen.jobs.length = 0;

  // ---------- 2. QR → pedido → NÃO imprime antes de aceitar ----------
  const tok = cq('select qr_token from dining_tables where number = 4');
  const tableLabel = cq('select label from dining_tables where number = 4');
  const frango = Number(cq("select id from menu_items where name = 'Frango Churrasco'")), sprite = Number(cq("select id from menu_items where name = 'Sprite' limit 1"));
  cq("update menu_items set available = true, active = true where id in (" + frango + "," + sprite + ")");
  const cctx = await b.newContext({ ...devices['Pixel 7'] }); const c = await cctx.newPage();
  await c.goto(`${L}/m/${tok}`, { waitUntil: 'load' });
  await c.getByRole('button', { name: 'Adicionar Frango Churrasco', exact: true }).click();
  await c.getByRole('button', { name: 'Mais Frango Churrasco' }).click();
  await c.getByRole('button', { name: /Adicionar Sprite/ }).first().click();
  await c.getByRole('button', { name: /Ver pedido/ }).click();
  await c.locator('input[placeholder^="Observação"]').first().fill('sem picante, bem passado');
  await c.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await c.waitForURL(/\/pedido\//, { timeout: 20000 });
  const oid = c.url().split('/pedido/')[1];
  const onum = lq(`select number from orders where id = '${oid}'`);
  check(!!onum, `2.1 cliente fez o pedido pelo QR Code (L${onum})`);
  await sleep(3000);
  check(kitchen.jobs.length === 0 && counter.jobs.length === 0, '2.2 nada é impresso enquanto o pedido está Pendente');

  // ---------- 3. gerente ACEITA → talões automáticos ----------
  await p.goto(L + '/admin/pedidos', { waitUntil: 'load' });
  const card = p.locator(`[data-testid="order-L${onum}"]`);
  await card.waitFor({ timeout: 15000 });
  const t0 = Date.now();
  await card.getByRole('button', { name: 'Iniciar preparação' }).click();
  check(await waitFor(() => kitchen.jobs.length === 1 && counter.jobs.length === 1, 15000), `3.1 aceitar o pedido imprime sozinho na cozinha e no balcão (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const kt = text(kitchen.jobs[0]), ct = text(counter.jobs[0]);
  check(kitchen.jobs[0].errors.length === 0 && counter.jobs[0].errors.length === 0, '3.2 só comandos ESC/POS válidos');
  check(kt.includes('COZINHA') && kt.includes(tableLabel) && kt.includes(`Pedido L${String(onum).padStart(4, '0')}`), `3.3 talão da cozinha: mesa e número do pedido (${tableLabel}, L${onum})`);
  check(/2x Frango Churrasco\s+12 000 FCFA/.test(kt) && /6 000 FCFA cada/.test(kt) && />> sem picante, bem passado/.test(kt), '3.4 produtos, quantidades, preços e observações');
  check(!/Sprite/.test(kt) && /Sprite/.test(ct) && ct.includes('BALC'), '3.5 cozinha só com comida, balcão só com bebidas');
  check(/Aceite por: gerente@nokau\.test/.test(kt), '3.6 talão diz quem aceitou');
  check(Math.max(...counter.jobs[0].tickets[0].lines.map((l) => l.length)) <= 32 && Math.max(...kitchen.jobs[0].tickets[0].lines.map((l) => l.length)) <= 48, '3.7 larguras respeitadas: 58 mm ≤ 32 col., 80 mm ≤ 48 col.');
  check(kitchen.jobs[0].tickets.every((t) => t.cut), '3.8 papel cortado no fim');
  check(lq(`select string_agg(status, ',') from print_jobs where order_id = '${oid}'`) === 'printed,printed', '3.9 trabalhos registados como "Impresso"');
  console.log('\n--- TALÃO DA COZINHA (descodificado da impressora virtual) ---\n' + kt + '\n--- TALÃO DO BALCÃO ---\n' + ct + '\n---\n');

  // ---------- 4. sem duplicados ----------
  await card.getByRole('button', { name: 'Voltar para Pendente' }).click(); await sleep(800);
  await p.locator(`[data-testid="order-L${onum}"]`).getByRole('button', { name: 'Iniciar preparação' }).click();
  await sleep(3500);
  check(kitchen.jobs.length === 1 && counter.jobs.length === 1, '4.1 aceitar outra vez o mesmo pedido NÃO imprime de novo');
  srv('local'); await sleep(4000);
  check(kitchen.jobs.length === 1 && counter.jobs.length === 1, '4.2 reiniciar o servidor do restaurante não reimprime nada');

  // ---------- 5. pedido aceite no SITE CENTRAL → impresso no restaurante ----------
  const co = await order(C, tok, [{ itemId: frango, quantity: 1 }]);
  await waitFor(() => lq(`select count(*) from orders where id = '${co.orderId}'`) === '1', 15000);
  cq(`update orders set status = 'preparing', status_changed_at = now() where id = '${co.orderId}'`);
  check(await waitFor(() => kitchen.jobs.some((j) => text(j).includes(`Pedido #${String(co.number).padStart(4, '0')}`)), 20000), '5.1 pedido aceite pelo gerente no site central → impresso na cozinha do restaurante');

  // ---------- 6. impressora desligada → repete e recupera sozinha ----------
  await kitchen.close();
  const o2 = await order(L, tok, [{ itemId: frango, quantity: 1 }]);
  lq(`update orders set status = 'preparing', status_changed_at = now() where id = '${o2.orderId}'`);
  check(await waitFor(() => lq(`select status||':'||attempts from print_jobs where order_id = '${o2.orderId}'`).startsWith('queued:') && lq(`select last_error from print_jobs where order_id = '${o2.orderId}'`).length > 0, 15000),
    `6.1 impressora desligada: o talão fica na fila com o erro ("${lq(`select last_error from print_jobs where order_id = '${o2.orderId}'`)}")`);
  await p.goto(L + '/admin/impressoras', { waitUntil: 'load' });
  check(await waitFor(() => p.locator(`[data-testid="printer-${pk}"]`).getAttribute('data-status').then((s) => s === 'offline'), 10000), '6.2 painel mostra a impressora "Sem ligação"');
  const k2 = await startFakePrinter(19100);
  check(await waitFor(() => k2.jobs.length === 1 && text(k2.jobs[0]).includes(`L${String(o2.number).padStart(4, '0')}`), 40000), '6.3 impressora volta → o talão sai sozinho (sem perder o pedido)');
  check(Number(lq(`select attempts from print_jobs where order_id = '${o2.orderId}'`)) > 1, '6.4 tentativas registadas');

  // ---------- 7. sem papel → não envia; papel reposto → imprime ----------
  k2.state.paperOut = true;
  const o3 = await order(L, tok, [{ itemId: frango, quantity: 1 }]);
  lq(`update orders set status = 'preparing', status_changed_at = now() where id = '${o3.orderId}'`);
  check(await waitFor(() => lq(`select coalesce(last_error,'') from print_jobs where order_id = '${o3.orderId}'`) === 'Sem papel.', 15000) && k2.jobs.length === 1, '7.1 sem papel: o talão não é enviado (espera)');
  check(await waitFor(() => p.locator(`[data-testid="printer-${pk}"]`).getAttribute('data-status').then((s) => s === 'paper_out'), 30000), '7.2 painel mostra "Sem papel"');
  k2.state.paperOut = false;
  check(await waitFor(() => k2.jobs.length === 2, 30000), '7.3 papel reposto → o talão sai');

  // ---------- 8. reimpressão manual (e duplo toque) ----------
  const job = lq(`select id from print_jobs where order_id = '${oid}' and printer_id = ${pk}`);
  await p.goto(L + '/admin/impressoras', { waitUntil: 'load' });
  const row = p.locator(`[data-testid="job-${job}"]`);
  await row.getByRole('button', { name: 'Reimprimir' }).dblclick();
  check(await waitFor(() => k2.jobs.some((j) => /REIMPRESS[AÃ]O/.test(text(j))), 15000), '8.1 reimpressão manual sai com a marca "REIMPRESSÃO"');
  await sleep(2500);
  check(k2.jobs.filter((j) => /REIMPRESS[AÃ]O/.test(text(j))).length === 1, '8.2 duplo toque em "Reimprimir" → um só talão');

  // ---------- 9. agente parou a meio de um envio → "incerto", nunca reenviado sozinho ----------
  const o4 = await order(L, tok, [{ itemId: frango, quantity: 1 }]);
  lq(`insert into print_jobs (printer_id, order_id, kind, status, dedupe_key, attempts, started_at) values (${pk}, '${o4.orderId}', 'order', 'printing', 'order:${o4.orderId}:p${pk}', 1, now() - interval '5 minutes')`);
  lq(`update orders set status = 'preparing', status_changed_at = now() where id = '${o4.orderId}'`);
  check(await waitFor(() => lq(`select status from print_jobs where order_id = '${o4.orderId}' and printer_id = ${pk}`) === 'uncertain', 15000), '9.1 envio interrompido fica "Incerto"');
  const before9 = k2.jobs.length; await sleep(3000);
  check(k2.jobs.length === before9, '9.2 e NÃO é reenviado sozinho (evita talão em dobro)');
  await p.reload({ waitUntil: 'load' });
  await p.locator(`[data-testid="job-${lq(`select id from print_jobs where order_id = '${o4.orderId}' and printer_id = ${pk}`)}"]`).getByRole('button', { name: 'Imprimir de novo' }).click();
  check(await waitFor(() => k2.jobs.length === before9 + 1, 15000), '9.3 o gerente decide "Imprimir de novo" → sai');

  // ---------- 10. USB (dispositivo do sistema) ----------
  await p.goto(L + '/admin/impressoras', { waitUntil: 'load' });
  await addPrinter({ name: 'USB teste', station: 'counter', usb: usbFile, paper: 80, cats: [] });
  const pu = lq("select id from printers where name = 'USB teste'");
  lq(`update printers set auto_print = false where id = ${pu}`);
  await p.locator(`[data-testid="printer-${pu}"]`).getByRole('button', { name: 'Imprimir teste' }).click();
  check(await waitFor(() => fs.statSync(usbFile).size > 100, 10000), `10.1 USB: bytes ESC/POS escritos no dispositivo (${fs.statSync(usbFile).size} bytes)`);
  const { decode } = require('./fake-printer.js');
  check(/TESTE DE IMPRESSAO/.test(decode(fs.readFileSync(usbFile)).tickets.map((t) => t.lines.join('\n')).join()), '10.2 conteúdo USB válido');
  const usbBad = p.locator('[data-testid="printer-form-new"]');
  await usbBad.locator('input[name=name]').fill('Mau'); await usbBad.locator('select[name=connection]').selectOption('usb'); await usbBad.locator('input[name=devicePath]').fill('/etc/passwd');
  await usbBad.getByRole('button', { name: 'Adicionar impressora' }).click();
  check(await waitFor(() => p.locator('text=Indique o dispositivo USB').isVisible(), 8000), '10.3 só aceita dispositivos de impressora (recusa /etc/passwd)');

  // ---------- 11. painel e permissões ----------
  const cpage = await (await b.newContext()).newPage();
  await cpage.goto(C + '/admin/login'); await cpage.fill('input[name=email]', 'gerente@nokau.test'); await cpage.fill('input[name=password]', 'senha-forte-123'); await cpage.click('button[type=submit]');
  await cpage.waitForURL(/dashboard/, { waitUntil: 'commit' }); await cpage.goto(C + '/admin/impressoras', { waitUntil: 'load' });
  check(await cpage.locator('[data-testid="print-central-notice"]').waitFor({ timeout: 15000 }).then(() => true, () => false), '11.1 no site central: explica que a impressão é feita no servidor do restaurante');
  check(cq('select count(*) from print_jobs') === '0', '11.2 o site central não cria trabalhos de impressão');
  const hist = await p.locator('[data-testid="print-jobs"]').innerText().catch(() => '');
  check(/Impresso/.test(hist) && /Reimpressão/.test(hist) && /Teste/.test(hist), '11.3 histórico com pedidos, testes e reimpressões');

  await b.close(); await k2.close(); await counter.close();
  console.log(`OK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
  process.exit(0);
})().catch((e) => { console.log('FATAL', e.message.slice(0, 900)); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
