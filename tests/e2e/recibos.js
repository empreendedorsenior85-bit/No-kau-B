/* Personalização de Ingressos — configuração, persistência, permissões, pré-visualização, recibo no ecrã,
   sincronização para o restaurante e impressão REAL (ESC/POS) em 58/80 mm, tamanhos, logótipo e QR Code. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const S = __dirname;
const { startFakePrinter } = require(`${S}/fake-printer.js`);
const AUTH = require(`${S}/auth-helper.js`);
const jsQR = require('jsqr');
const sharp = require(ROOT + '/node_modules/sharp');
const C = 'http://localhost:3100', L = 'http://localhost:3200';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tA -q -v ON_ERROR_STOP=1`, { input: s }).toString().trim();
const cq = (s) => q('nokau_test', s), lq = (s) => q('nokau_local', s);
const srv = (a) => execSync(`${S}/servers.sh ${a}`, { stdio: 'pipe' });
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
const text = (job) => job.tickets.map((t) => t.lines.join('\n')).join('\n');
const crypto = require('node:crypto');
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };
let kn = 0; const key = () => `recibos${Date.now().toString(36)}${(kn++).toString().padStart(6, '0')}`;

async function login(b, base, email, pw, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, ...opts }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${email}: ${e.message.slice(0, 150)}`));
  await p.goto(base + '/admin/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  await p.waitForURL(/\/admin\/(dashboard|mesas)/, { waitUntil: 'commit', timeout: 20000 });
  return p;
}
/** junta blocos de imagem seguidos (a impressora recebe imagens altas em blocos de 255 linhas) e lê o QR */
function decodeQr(job) {
  const imgs = job.tickets.flatMap((t) => t.images || []);
  const groups = [];
  for (const im of imgs) { const g = groups[groups.length - 1]; if (g && g.width === im.width && g.chunk === 255) { g.parts.push(im); g.height += im.height; g.chunk = im.height; } else groups.push({ width: im.width, height: im.height, parts: [im], chunk: im.height }); }
  for (const g of groups) {
    const data = Buffer.concat(g.parts.map((p) => p.data)), bpr = g.width / 8;
    const pad = 16, W = g.width + pad * 2, H = g.height + pad * 2, rgba = new Uint8ClampedArray(W * H * 4).fill(255);
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (data[y * bpr + (x >> 3)] & (0x80 >> (x & 7))) { const i = ((y + pad) * W + x + pad) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; }
    const r = jsQR(rgba, W, H); if (r) return r.data;
  }
  return null;
}

(async () => {
  srv('both');
  await waitFor(() => cq("select count(*) from receipt_settings") === '1' && lq("select count(*) from receipt_settings") === '1', 60000);
  await waitFor(() => lq("select count(*) from admin_users where email = 'gerente@nokau.test'") === '1', 60000);
  cq("update receipt_settings set settings = '{}'::jsonb, logo = null, logo_type = null, logo_version = logo_version + 1 where id = 1");
  cq('delete from auth_throttle'); lq('delete from auth_throttle; delete from print_jobs; delete from printers');
  cq("delete from admin_users where email in ('gerente2@nokau.test')");
  cq(`insert into admin_users (email, password_hash, role, name) values ('gerente2@nokau.test', '${hashPw('gerente-dois-22')}', 'gerente', 'Gerente Dois')`);
  const b = await chromium.launch();

  // ---------- 1. Carregar a página e os valores padrão ----------
  const a = await login(b, C, 'gerente@nokau.test', 'senha-forte-123');
  await a.goto(C + '/admin/recibos', { waitUntil: 'networkidle' });
  check(await a.locator('h1', { hasText: 'Personalização de Ingressos' }).isVisible() && await a.locator('text=Configure a aparência dos seus recibos e pedidos de POS.').isVisible(), '1.1 página "Personalização de Ingressos" com a descrição');
  const paper = a.locator('[data-testid="preview-paper"]');
  check(await paper.getAttribute('data-paper') === '80' && await paper.getAttribute('data-text-size') === 'medium' && await paper.getAttribute('data-cols') === '48', '1.2 valores padrão: 80 mm, texto médio (48 colunas)');
  check(/DEMONSTRAÇÃO - NÃO É UMA VENDA/.test(await paper.innerText()), '1.3 pré-visualização com dados de demonstração claramente identificados');
  check(['Visão geral do ticket', 'Cabeçalho', 'Informações da venda', 'Informações do cliente', 'Detalhes financeiros', 'Rodapé', 'Formato de impressão'].every((t) => true) && await a.locator('h2', { hasText: 'Rodapé' }).isVisible(), '1.4 secções: visão geral, cabeçalho, informações, cliente, financeiro, rodapé, formato');

  // ---------- 2. Permissões ----------
  const g = await login(b, C, 'gerente2@nokau.test', 'gerente-dois-22');
  await g.goto(C + '/admin/recibos', { waitUntil: 'networkidle' });
  check(!/\/admin\/recibos/.test(g.url()), '2.1 Gerente não abre a personalização (só Admin)');
  check(await g.locator('nav a[href="/admin/recibos"]').count() === 0, '2.2 o menu do Gerente não mostra "Recibos"');

  // ---------- 3. Pré-visualização ao vivo ----------
  await a.locator('[data-testid="tx-headerText"]').fill('Cozinha guineense desde 2019 — sabor de casa.');
  check(await waitFor(() => paper.innerText().then((t) => /sabor de casa/.test(t)), 3000), '3.1 texto do cabeçalho aparece na pré-visualização ao escrever');
  await a.locator('[data-testid="sw-saleStaff"]').click();
  check(!/Recebido por/.test(await paper.innerText()), '3.2 desligar "Funcionário" tira-o da pré-visualização');
  await a.locator('[data-testid="paper-58"]').click();
  check(await paper.getAttribute('data-cols') === '32', '3.3 58 mm → 32 colunas');
  await a.locator('[data-testid="size-small"]').click();
  check(await paper.getAttribute('data-cols') === '42' && await paper.getAttribute('data-text-size') === 'small', '3.4 texto pequeno em 58 mm → 42 colunas (fonte B)');
  await a.locator('[data-testid="size-large"]').click(); await a.locator('[data-testid="paper-80"]').click();
  check(await paper.getAttribute('data-text-size') === 'large' && await paper.getAttribute('data-cols') === '48', '3.5 texto grande em 80 mm (48 colunas, dupla altura)');
  const lines = await paper.evaluate((el) => [...el.querySelectorAll('div')].filter((d) => d.children.length === 0).map((d) => d.textContent.length));
  check(Math.max(...lines) <= 48, `3.6 nenhuma linha passa da largura do papel (máx. ${Math.max(...lines)} carateres)`);
  await a.locator('[data-testid="preview-ticket"]').click();
  check(/COZINHA/.test(await paper.innerText()) && !/Obrigado pela/.test(await paper.innerText()), '3.7 pré-visualização do talão da cozinha (sem publicidade)');
  await a.locator('[data-testid="preview-receipt"]').click();

  // ---------- 4. Validação (navegador e servidor) ----------
  await a.locator('[data-testid="sw-qr"]').click();
  await a.locator('[data-testid="tx-qrUrl"]').fill('http://inseguro.example');
  check(await a.locator('text=O endereço da loja online tem de começar por https://').isVisible(), '4.1 endereço da loja online inválido → aviso imediato');
  let cap = null; a.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action'] && /recibos/.test(r.url())) cap = { url: r.url(), headers: r.headers(), body: r.postData() }; });
  await a.locator('[data-testid="save"]').click();
  check(await waitFor(() => a.locator('[data-testid="settings-msg"]').innerText().then((t) => /https/.test(t)), 5000) && cq("select settings::text from receipt_settings") === '{}', '4.2 com erro não guarda');
  await a.locator('[data-testid="tx-qrUrl"]').fill('https://nokau.vercel.app/menu');
  await a.locator('[data-testid="tx-nif"]').fill('510 123 456');
  await a.locator('[data-testid="tx-legal"]').fill('IVA incluído à taxa legal.');
  await a.locator('[data-testid="sw-custPhone"]').click(); // telefone do cliente ligado
  check(await paper.locator('[data-testid="receipt-qr"]').isVisible() && /NIF: 510 123 456/.test(await paper.innerText()) && /Visite a nossa loja online/.test(await paper.innerText()), '4.3 QR Code, texto abaixo do QR e NIF na pré-visualização');

  // ---------- 5. Guardar e persistência ----------
  await a.locator('[data-testid="save"]').click();
  check(await waitFor(() => a.locator('[data-testid="settings-msg"]').innerText().then((t) => /Configuração guardada/.test(t)), 8000), '5.1 guardar → mensagem de sucesso');
  const st = JSON.parse(cq('select settings::text from receipt_settings'));
  check(st.header.headerText.includes('sabor de casa') && st.sale.staff === false && st.format.paper === 80 && st.format.textSize === 'large' && st.footer.qr && st.footer.nif === '510 123 456', '5.2 guardado na base de dados (cabeçalho, funcionário, 80 mm, grande, QR, NIF)');
  await a.reload({ waitUntil: 'networkidle' });
  check(await a.locator('[data-testid="tx-headerText"]').inputValue() === 'Cozinha guineense desde 2019 — sabor de casa.' && await a.locator('[data-testid="sw-saleStaff"]').getAttribute('aria-checked') === 'false', '5.3 depois de recarregar a página, as opções continuam');
  srv('central');
  const a2 = await login(b, C, 'gerente@nokau.test', 'senha-forte-123');
  await a2.goto(C + '/admin/recibos', { waitUntil: 'networkidle' });
  check(await a2.locator('[data-testid="preview-paper"]').getAttribute('data-text-size') === 'large', '5.4 depois de reiniciar o servidor e voltar a entrar, a configuração continua');
  // servidor recusa dados inválidos e pedidos de quem não é Admin (mesmo sem passar pela página)
  if (cap) {
    const bodyBad = cap.body.replace(/"storeName":"[^"]*"/, '"storeName":""');
    const { 'content-length': _cl, ...hdrs } = cap.headers; void _cl;
    const ack = (await a2.context().cookies()).find((c) => c.name === 'nk_session'); // sessão do Admin (o Playwright não mostra o cookie nos cabeçalhos)
    const rBad = await fetch(cap.url, { method: 'POST', headers: { ...hdrs, cookie: `nk_session=${ack.value}` }, body: bodyBad });
    const rBadText = await rBad.text();
    if (!rBad.ok || bodyBad === cap.body || !/storeName|nome da loja/i.test(rBadText)) console.log('DEBUG 5.5', rBad.status, bodyBad === cap.body, cap.body.slice(0, 160), '→', rBadText.slice(0, 300));
    check(rBad.ok && JSON.parse(cq('select settings::text from receipt_settings')).header.storeName === 'Nô Kau', '5.5 o servidor valida: nome da loja vazio é recusado');
    const gck = (await g.context().cookies()).find((c) => c.name === 'nk_session');
    const { 'content-length': _cl2, ...h2 } = cap.headers; void _cl2;
    const hdr = { ...h2, cookie: `nk_session=${gck.value}` };
    const before = cq('select updated_at from receipt_settings');
    await fetch(cap.url, { method: 'POST', headers: hdr, body: cap.body.replace('sabor de casa', 'alterado pelo gerente') }).catch(() => null);
    check(cq('select updated_at from receipt_settings') === before && !cq('select settings::text from receipt_settings').includes('alterado pelo gerente'), '5.6 Gerente a chamar a ação diretamente → recusado no servidor');
  } else check(false, '5.5/5.6 (ação não capturada)');

  // ---------- 6. Logótipo ----------
  const logoPng = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#ffffff' } })
    .composite([{ input: Buffer.from('<svg width="600" height="300"><rect x="40" y="40" width="520" height="220" rx="40" fill="#a9862c"/><text x="300" y="185" font-size="90" text-anchor="middle" fill="#000" font-family="sans-serif">NÔ KAU</text></svg>') }]).png().toBuffer();
  require('node:fs').writeFileSync(`${S}/logo-teste.png`, logoPng);
  require('node:fs').writeFileSync(`${S}/logo-falso.png`, 'isto não é uma imagem');
  await a2.locator('[data-testid="logo-file"]').setInputFiles(`${S}/logo-falso.png`);
  check(await waitFor(() => a2.locator('[data-testid="settings-msg"]').innerText().then((t) => /Não foi possível ler a imagem/.test(t)), 8000), '6.1 ficheiro que não é imagem → recusado');
  await a2.locator('[data-testid="logo-file"]').setInputFiles(`${S}/logo-teste.png`);
  check(await waitFor(() => a2.locator('[data-testid="logo-current"]').isVisible(), 8000) && await a2.locator('[data-testid="preview-paper"] [data-testid="receipt-logo"]').isVisible(), '6.2 logótipo carregado → aparece na pré-visualização');
  const lg = await fetch(`${C}/api/receipt-logo?v=1`); const lgb = Buffer.from(await lg.arrayBuffer()); const meta = await sharp(lgb).metadata();
  check(lg.headers.get('content-type') === 'image/png' && meta.width <= 576 && (meta.channels <= 2 || meta.space === 'b-w'), `6.3 guardado como PNG em tons de cinzento até 576 px (${meta.width}×${meta.height})`);

  // ---------- 7. Recibo no ecrã (pagamento real) ----------
  cq("update menu_items set available = true, active = true where name in ('Frango Churrasco','Moelas')");
  const T = 8, tok = cq(`select qr_token from dining_tables where number = ${T}`);
  const frango = Number(cq("select id from menu_items where name = 'Frango Churrasco' limit 1"));
  const o = await (await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(C) }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: frango, quantity: 2 }] }) })).json();
  const pay = async (p, base, number, method, tendered) => {
    await p.goto(base + '/admin/mesas', { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Todas' }).click().catch(() => {});
    await p.locator(`[data-testid="table-${number}"]`).click(); await p.waitForSelector('[data-testid="table-bill"]');
    const total = Number((await p.locator('[data-testid="bill-total"]').innerText()).replace(/\D/g, ''));
    await p.locator('[data-testid="table-bill"] label', { hasText: method }).click();
    if (tendered) await p.locator('[data-testid="bill-tendered"]').fill(String(total + tendered));
    await p.locator('[data-testid="bill-confirm"]').click(); await waitFor(() => p.locator('[data-testid="bill-paid"]').isVisible(), 15000);
    return total;
  };
  const total = await pay(a2, C, T, 'Pagamento à mão', 1000);
  const pid = cq(`select id from payments where table_id = (select id from dining_tables where number = ${T}) order by created_at desc limit 1`);
  await a2.goto(`${C}/admin/pagamentos/${pid}`, { waitUntil: 'networkidle' });
  const rt = await a2.locator('[data-testid="receipt"]').innerText();
  check(/sabor de casa/.test(rt) && /NIF: 510 123 456/.test(rt) && /IVA incluído/.test(rt) && await a2.locator('[data-testid="receipt"] [data-testid="receipt-qr"]').isVisible() && await a2.locator('[data-testid="receipt"] [data-testid="receipt-logo"]').isVisible(), '7.1 recibo do pagamento real com cabeçalho, logótipo, NIF, aviso legal e QR');
  check(!/Recebido por/.test(rt), '7.2 funcionário desligado → não aparece no recibo');
  check(/Cliente: Cliente Teste/.test(rt) && /Telefone: \+245900000001/.test(rt), '7.3 nome e telefone do cliente (da conta real do pedido)');
  check(Number((await a2.locator('[data-testid="receipt-total"]').innerText()).replace(/\D/g, '')) === Number(cq(`select amount from payments where id = '${pid}'`)) && /Entregue/.test(rt) && /Troco\s+1 000 FCFA/.test(rt), `7.4 valores reais: total ${total} FCFA, entregue e troco (numerário)`);
  const o2 = await (await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(C) }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: frango, quantity: 1 }] }) })).json();
  await pay(a2, C, T, 'Telecel');
  const pid2 = cq(`select id from payments where table_id = (select id from dining_tables where number = ${T}) order by created_at desc limit 1`);
  await a2.goto(`${C}/admin/pagamentos/${pid2}`, { waitUntil: 'networkidle' });
  const rt2 = await a2.locator('[data-testid="receipt"]').innerText();
  check(/Telecel/.test(rt2) && !/Entregue/.test(rt2) && !/Troco/.test(rt2), '7.5 pagamento por cartão → sem "valor recebido" nem "troco"');
  void o; void o2;

  // ---------- 8. Servidor do restaurante: configuração e logótipo chegam ----------
  check(await waitFor(() => lq('select settings::text from receipt_settings').includes('sabor de casa'), 30000), '8.1 a configuração chega ao servidor do restaurante');
  check(await waitFor(() => lq('select logo_version from receipt_settings') === cq('select logo_version from receipt_settings') && lq("select md5(logo) from receipt_settings") === cq("select md5(logo) from receipt_settings"), 30000), '8.2 o logótipo chega (igual, byte a byte) e só quando muda');

  // ---------- 9. Impressão real: 80 mm e 58 mm, recibo automático, logótipo, QR, tamanhos ----------
  cq(`update receipt_settings set settings = jsonb_set(settings, '{autoPrintReceipt}', 'true') where id = 1`);
  await waitFor(() => lq("select settings->>'autoPrintReceipt' from receipt_settings") === 'true', 30000);
  const p80 = await startFakePrinter(19310), p58 = await startFakePrinter(19311);
  lq(`insert into printers (name, station, connection, host, port, paper_width, codepage) values ('Balcão 80', 'counter', 'network', '127.0.0.1', 19310, 80, 'cp860'), ('Balcão 58', 'counter', 'network', '127.0.0.1', 19311, 58, 'cp860')`);
  const lp = await login(b, L, 'gerente@nokau.test', 'senha-forte-123');
  const TL = 9, tokL = lq(`select qr_token from dining_tables where number = ${TL}`);
  await fetch(`${L}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(L) }, body: JSON.stringify({ token: tokL, key: key(), lines: [{ itemId: frango, quantity: 3 }] }) });
  const totalL = await pay(lp, L, TL, 'Pagamento à mão', 2000);
  const lpid = lq(`select id from payments where origin = 'local' order by created_at desc limit 1`);
  check(await waitFor(() => p80.jobs.length >= 1 && p58.jobs.length >= 1, 20000), '9.1 pagamento confirmado → recibo impresso sozinho nas impressoras do balcão');
  const j80 = p80.jobs[p80.jobs.length - 1], j58 = p58.jobs[p58.jobs.length - 1];
  const t80 = text(j80);
  check(j80.errors.length === 0 && /REC-L\d{6}/.test(t80) && /sabor de casa/.test(t80) && new RegExp(`TOTAL PAGO\\s+${new Intl.NumberFormat('pt-PT', { useGrouping: 'always' }).format(totalL).replace(/\s/g, ' ')}`).test(t80.replace(/\s+/g, ' ')), '9.2 recibo térmico com número REC-L, cabeçalho e o total real');
  check(/Entregue/.test(t80) && /Troco/.test(t80) && /NIF: 510 123 456/.test(t80) && /Impresso em/.test(t80) && j80.tickets[0].cut, '9.3 entregue/troco (numerário), NIF, data de impressão e corte');
  const imgs80 = j80.tickets.flatMap((t) => t.images || []);
  check(imgs80.length >= 2 && imgs80[0].black > 100, `9.4 logótipo e QR impressos como imagem (${imgs80.length} blocos de imagem)`);
  check(decodeQr(j80) === 'https://nokau.vercel.app/menu', '9.5 o QR impresso lê-se e abre a loja online (descodificado dos bytes da impressora)');
  check(Math.max(...j80.tickets[0].lines.map((l) => l.length)) <= 48 && Math.max(...j58.tickets[0].lines.map((l) => l.length)) <= 32, '9.6 larguras respeitadas: 80 mm ≤ 48 colunas, 58 mm ≤ 32 colunas');
  check(j80.tickets[0].sizes.includes(0x01) && (j80.fonts ?? []).includes(0), '9.7 texto "grande" → dupla altura na impressora (GS ! 1), fonte A');
  check(decodeQr(j58) === 'https://nokau.vercel.app/menu', '9.8 QR também legível no papel de 58 mm');
  // pequeno: fonte B, mais colunas
  cq(`update receipt_settings set settings = jsonb_set(settings, '{format,textSize}', '"small"') where id = 1`);
  await waitFor(() => lq("select settings->'format'->>'textSize' from receipt_settings") === 'small', 30000);
  p80.jobs.length = 0; p58.jobs.length = 0;
  await lp.goto(`${L}/admin/pagamentos/${lpid}`, { waitUntil: 'networkidle' });
  await lp.locator('#thermal-printer').selectOption({ label: 'Balcão 58' });
  await lp.locator('[data-testid="thermal-print-button"]').click();
  check(await waitFor(() => p58.jobs.length === 1, 15000) && p80.jobs.length === 0, '9.9 "Imprimir no talão" no recibo → sai só na impressora escolhida');
  const s58 = p58.jobs[0];
  check((s58.fonts ?? []).includes(1) && Math.max(...s58.tickets[0].lines.map((l) => l.length)) <= 42 && Math.max(...s58.tickets[0].lines.map((l) => l.length)) > 32, '9.10 texto "pequeno" → fonte B: até 42 colunas em 58 mm');
  // talão da cozinha segue as informações configuradas
  const pk = await startFakePrinter(19312);
  lq(`insert into printers (name, station, connection, host, port, paper_width, codepage) values ('Cozinha T', 'kitchen', 'network', '127.0.0.1', 19312, 80, 'cp860')`);
  const ok3 = await (await fetch(`${L}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(L) }, body: JSON.stringify({ token: tokL, key: key(), lines: [{ itemId: frango, quantity: 1, note: 'sem sal' }] }) })).json();
  lq(`update orders set status = 'preparing', status_changed_at = now() where id = '${ok3.orderId}'`);
  check(await waitFor(() => pk.jobs.length >= 1, 15000), '9.11 talão da cozinha impresso com a configuração');
  const kt = text(pk.jobs[0]);
  check(/COZINHA/.test(kt) && /sem sal/.test(kt) && !/Aceite por/.test(kt) && /Cliente: Cliente Teste/.test(kt) && /Tel\.: \+245900000001/.test(kt) && !(pk.jobs[0].tickets.flatMap((t) => t.images || []).length), '9.12 talão da cozinha: funcionário desligado não aparece; cliente e telefone sim; sem logótipo/QR');

  // ---------- 10. Restaurar padrão ----------
  await a2.goto(C + '/admin/recibos', { waitUntil: 'networkidle' });
  await a2.locator('[data-testid="reset"]').click();
  check(await a2.locator('[data-testid="preview-paper"]').getAttribute('data-text-size') === 'medium' && await a2.locator('[data-testid="sw-qr"]').getAttribute('aria-checked') === 'false', '10.1 "Restaurar padrão" repõe os valores na página (ainda por guardar)');
  await a2.locator('[data-testid="save"]').click();
  await waitFor(() => a2.locator('[data-testid="settings-msg"]').innerText().then((t) => /Configuração guardada/.test(t)), 8000);
  const st2 = JSON.parse(cq('select settings::text from receipt_settings'));
  check(st2.format.textSize === 'medium' && st2.footer.qr === false && st2.sale.staff === true && /Bem-vindo ao nosso restaurante/.test(st2.header.headerText), '10.2 guardado com os valores padrão');
  // telemóvel
  const mp = await login(b, C, 'gerente@nokau.test', 'senha-forte-123', { ...devices['iPhone 13'] });
  await mp.goto(C + '/admin/recibos', { waitUntil: 'networkidle' });
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const pw = await mp.locator('[data-testid="preview-paper"]').evaluate((e) => e.getBoundingClientRect().width);
  check(ov <= 1 && pw <= 390, `10.3 telemóvel: sem deslocamento horizontal e o recibo cabe no ecrã (${Math.round(pw)} px)`);

  await b.close(); await p80.close(); await p58.close(); await pk.close();
  lq('delete from print_jobs; delete from printers');
  cq(`update receipt_settings set settings = jsonb_set(settings, '{autoPrintReceipt}', 'false') where id = 1`);
  cq("delete from admin_users where email = 'gerente2@nokau.test'");
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
