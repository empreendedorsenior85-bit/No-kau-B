/* Impressora Bluetooth (clássico/SPP, porta série /dev/rfcommN) — ponta a ponta no servidor do restaurante,
   com uma impressora virtual num pseudo-terminal (mesmo tipo de dispositivo e mesmas regras de linha). */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium } = require('playwright');
const { execSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const S = __dirname;
const { decode } = require(`${S}/fake-printer.js`);
const AUTH = require(`${S}/auth-helper.js`);
const L = 'http://localhost:3200';
const lq = (s) => execSync('psql -h localhost -p 5433 -U postgres -d nokau_local -tA -q -v ON_ERROR_STOP=1', { input: s }).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
const PORT = '/tmp/nokau-rfcomm0', CAP = `${S}/bt-capture.bin`;
let fake = null;
const startFake = async () => { fake = spawn('python3', ['-I', `${S}/fake-bt.py`, PORT, CAP], { stdio: 'ignore', detached: true }); await waitFor(() => fs.existsSync(PORT), 5000, 100); };
const stopFake = () => { try { process.kill(-fake.pid); } catch {} try { fs.unlinkSync(PORT); } catch {} };
let key = 0;

(async () => {
  try { fs.unlinkSync(CAP); } catch {}
  execSync(`${S}/servers.sh local`, { stdio: 'pipe' });
  await waitFor(() => lq("select count(*) from admin_users where email = 'gerente@nokau.test'") === '1', 60000);
  await waitFor(() => lq("select coalesce((select pg_get_constraintdef(oid) like '%bluetooth%' from pg_constraint where conname = 'printers_connection_check'), false)") === 't', 30000);
  lq('delete from print_jobs; delete from printers; delete from auth_throttle');
  await startFake();
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1366, height: 1000 } })).newPage();
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 150)));
  await p.goto(L + '/admin/login'); await p.fill('input[name=email]', 'gerente@nokau.test'); await p.fill('input[name=password]', 'senha-forte-123'); await p.click('button[type=submit]');
  await p.waitForURL(/\/admin\/dashboard/, { waitUntil: 'commit' });
  await p.goto(L + '/admin/impressoras', { waitUntil: 'networkidle' });

  // 1. configurar
  const f = p.locator('[data-testid="printer-form-new"]');
  await f.locator('input[name=name]').fill('Balcão BT'); await f.locator('select[name=station]').selectOption('counter');
  await f.locator('select[name=connection]').selectOption('bluetooth');
  check(await f.locator('input[name=devicePath]').inputValue() === '/dev/rfcomm0', '1.1 ligação "Bluetooth" no painel, com a porta /dev/rfcomm0 sugerida');
  await f.locator('input[name=devicePath]').fill('/etc/passwd'); await f.getByRole('button', { name: 'Adicionar impressora' }).click();
  check(await waitFor(() => p.locator('text=Indique a porta Bluetooth').isVisible(), 8000), '1.2 só aceita portas Bluetooth (recusa /etc/passwd)');
  check(await f.locator('input[name=name]').inputValue() === 'Balcão BT' && await f.locator('select[name=connection]').inputValue() === 'bluetooth', '1.2b depois do erro, o que foi escrito continua no formulário');
  await f.locator('input[name=devicePath]').fill(PORT); await f.locator('select[name=paperWidth]').selectOption('58');
  await f.getByRole('button', { name: 'Adicionar impressora' }).click();
  await waitFor(() => lq("select count(*) from printers where connection = 'bluetooth'") === '1', 10000);
  const pid = lq("select id from printers where connection = 'bluetooth'");
  check(lq(`select device_path from printers where id = ${pid}`) === PORT, '1.3 impressora Bluetooth guardada');
  const card = p.locator(`[data-testid="printer-${pid}"]`);
  check(/Bluetooth/.test(await card.innerText()), '1.4 o cartão mostra a ligação "Bluetooth"');

  // 2. testar ligação e talão de teste
  await card.getByRole('button', { name: 'Testar ligação' }).click();
  check(await waitFor(async () => /Ligada|online/i.test(await card.innerText()) || (await card.getAttribute('data-status')) === 'online', 10000), '2.1 "Testar ligação": a porta Bluetooth abre (impressora ligada)');
  const before = fs.existsSync(CAP) ? fs.statSync(CAP).size : 0;
  await card.getByRole('button', { name: 'Imprimir teste' }).click();
  check(await waitFor(() => lq(`select count(*) from print_jobs where printer_id = ${pid} and kind = 'test' and status = 'printed'`) === '1', 15000), '2.2 talão de teste enviado pela porta Bluetooth');
  await sleep(500);
  const raw = fs.readFileSync(CAP).subarray(before);
  const dec = decode(raw);
  check(raw.length > 200 && dec.errors.length === 0, `2.3 a impressora recebeu ${raw.length} bytes ESC/POS válidos`);
  check(!raw.includes(0x0d), '2.4 sem CR acrescentados pela porta série (modo raw aplicado)');
  const txt = dec.tickets.map((t) => t.lines.join('\n')).join('\n');
  check(/TESTE DE IMPRESSAO/.test(txt) && /Bluetooth/.test(txt) && /Nô Kau · Camarão · Ação · Pão/.test(txt.replace(/\n/g, " ")) && dec.tickets[0]?.cut, '2.5 talão de teste correto (ligação "Bluetooth", acentos, corte)');
  check(dec.tickets[0].lines.every((l) => l.length <= 32), '2.6 largura de 58 mm respeitada (≤ 32 colunas)');

  // 3. pedido aceite → impresso automaticamente por Bluetooth
  const tok = lq('select qr_token from dining_tables where number = 3');
  const sprite = Number(lq("select id from menu_items where active and available order by id limit 1"));
  const order = async () => (await (await fetch(`${L}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(L) },
    body: JSON.stringify({ token: tok, key: `btprint${Date.now()}${key++}`.padEnd(20, '0'), lines: [{ itemId: sprite, quantity: 2, note: 'bem gelado' }] }) })).json());
  const o1 = await order();
  const n1 = fs.statSync(CAP).size;
  lq(`update orders set status = 'preparing', status_changed_at = now() where id = '${o1.orderId}'`);
  check(await waitFor(() => lq(`select status from print_jobs where order_id = '${o1.orderId}' and printer_id = ${pid}`) === 'printed', 15000), '3.1 pedido aceite → talão impresso sozinho pela impressora Bluetooth');
  await sleep(400);
  const t1 = decode(fs.readFileSync(CAP).subarray(n1)).tickets.map((t) => t.lines.join('\n')).join('\n');
  check(/Mesa 3/.test(t1) && /2x/.test(t1) && /bem gelado/.test(t1) && /BALC[AÃ]O/.test(t1), '3.2 talão com mesa, quantidade, observação e posto');

  // 4. impressora desligada: fica na fila com a causa e sai quando volta
  stopFake();
  const o2 = await order();
  lq(`update orders set status = 'preparing', status_changed_at = now() where id = '${o2.orderId}'`);
  check(await waitFor(() => /Bluetooth/.test(lq(`select coalesce(last_error,'') from print_jobs where order_id = '${o2.orderId}'`)) && lq(`select status from print_jobs where order_id = '${o2.orderId}'`) === 'queued', 15000),
    `4.1 impressora desligada: o talão fica na fila com a causa ("${lq(`select coalesce(last_error,'') from print_jobs where order_id = '${o2.orderId}'`)}")`);
  await p.goto(L + '/admin/impressoras', { waitUntil: 'networkidle' });
  await card.getByRole('button', { name: 'Testar ligação' }).click();
  check(await waitFor(async () => /não existe|desligada|alcance/i.test(await p.locator('[data-testid="printer-msg"]').innerText().catch(() => '')) || /não existe|desligada|alcance/i.test(await card.innerText()), 10000), '4.2 "Testar ligação" explica o problema em português');
  const n2 = fs.statSync(CAP).size;
  await startFake();
  check(await waitFor(() => lq(`select status from print_jobs where order_id = '${o2.orderId}'`) === 'printed', 40000), '4.3 impressora volta → o talão sai sozinho (sem perder o pedido)');
  await sleep(400);
  check(/Mesa 3/.test(decode(fs.readFileSync(CAP).subarray(n2)).tickets.map((t) => t.lines.join('\n')).join('\n')), '4.4 conteúdo correto depois da falha');
  check(lq(`select count(*) from print_jobs where order_id = '${o2.orderId}'`) === '1', '4.5 sem talões em dobro');

  await b.close(); stopFake();
  lq('delete from print_jobs; delete from printers');
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
})().catch((e) => { stopFake(); console.log('FATAL', e.message); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
