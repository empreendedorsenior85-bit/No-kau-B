/* Auditoria: pagamentos/vendas (0 FCFA), relatórios PDF/CSV (Admin e Gerente), perfil de visitante sem palavra-passe,
   reservas e botões de chamada. Dados reais criados pelo próprio teste (pedidos, pagamentos, reservas). */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const crypto = require('node:crypto');
const S = __dirname;
const AUTH = require(`${S}/auth-helper.js`);
const C = 'http://localhost:3100';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tA -q -v ON_ERROR_STOP=1`, { input: s }).toString().trim();
const cq = (s) => q('nokau_test', s);
const srv = (a) => execSync(`${S}/servers.sh ${a}`, { stdio: 'pipe' });
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };
const digits = (s) => Number(String(s).replace(/\D/g, '')) || 0;
let kn = 0; const key = () => `auditoria${Date.now().toString(36)}${(kn++).toString().padStart(6, '0')}`;
const RUN = Date.now().toString().slice(-6);
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function login(b, email, pw, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, acceptDownloads: true, ...opts }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${email}: ${e.message.slice(0, 150)}`));
  await p.goto(C + '/admin/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  await p.waitForURL(/\/admin\/(dashboard|mesas)/, { waitUntil: 'commit', timeout: 20000 });
  return p;
}

(async () => {
  srv('central');
  await waitFor(() => cq("select count(*) from information_schema.tables where table_name = 'visitor_reservations'") === '1', 60000);
  cq('delete from auth_throttle');
  cq("update service_calls set status = 'done', done_at = now(), done_by = 'teste', status_changed_at = now() where status in ('open','ack') and table_id = (select id from dining_tables where number = 7)");
  cq("delete from admin_users where email = 'gerente.aud@nokau.test'");
  cq(`insert into admin_users (email, password_hash, role, name) values ('gerente.aud@nokau.test', '${hashPw('gerente-aud-1')}', 'gerente', 'Gerente Auditoria')`);
  cq("update menu_items set available = true, active = true where name in ('Frango Churrasco','Moelas')");
  const b = await chromium.launch();

  // ---------- 1. Pagamento confirmado SEM marcar o pedido "Concluído" (a causa do 0 FCFA) ----------
  const T = 7, tok = cq(`select qr_token from dining_tables where number = ${T}`);
  const frango = Number(cq("select id from menu_items where name = 'Frango Churrasco' limit 1"));
  const o = await (await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(C) }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: frango, quantity: 2 }] }) })).json();
  check(!!o.orderId && cq(`select status from orders where id = '${o.orderId}'`) === 'pending', '1.1 pedido real criado e ainda "Pendente"');
  const g = await login(b, 'gerente.aud@nokau.test', 'gerente-aud-1');
  await g.goto(C + '/admin/dashboard?r=hoje', { waitUntil: 'networkidle' });
  const salesBefore = Number(await g.locator('[data-testid="hero-revenue"]').getAttribute('data-raw'));
  await g.goto(C + '/admin/mesas', { waitUntil: 'networkidle' }); await g.getByRole('button', { name: 'Todas' }).click().catch(() => {});
  await g.locator(`[data-testid="table-${T}"]`).click(); await g.waitForSelector('[data-testid="table-bill"]');
  const billTotal = digits(await g.locator('[data-testid="bill-total"]').innerText());
  await g.locator('[data-testid="table-bill"] label', { hasText: 'Orange Money' }).click();
  await g.locator('[data-testid="bill-confirm"]').click(); await waitFor(() => g.locator('[data-testid="bill-paid"]').isVisible(), 15000);
  const pid = cq(`select id from payments where table_id = (select id from dining_tables where number = ${T}) order by created_at desc limit 1`);
  check(cq(`select status from orders where id = '${o.orderId}'`) === 'pending' && !!pid, `1.2 pagamento confirmado (${billTotal} FCFA) com o pedido ainda "Pendente"`);
  // o pagamento fecha a conta inteira da mesa (pode incluir pedidos de dias anteriores ou já concluídos): o que entra de novo nas vendas de HOJE
  const expDelta = Number(cq(`select coalesce(sum(total),0) from orders where payment_id = '${pid}' and status not in ('done','cancelled') and (created_at at time zone 'Africa/Bissau')::date = (now() at time zone 'Africa/Bissau')::date`));
  await g.goto(C + '/admin/dashboard?r=hoje', { waitUntil: 'networkidle' });
  const salesAfter = Number(await g.locator('[data-testid="hero-revenue"]').getAttribute('data-raw'));
  const paid = Number(await g.locator('[data-testid="hero-paid"]').getAttribute('data-raw'));
  check(expDelta >= 2 * 6000 && salesAfter - salesBefore === expDelta, `1.3 Visão geral: vendas sobem ${expDelta} FCFA (pedidos de hoje pagos e ainda não concluídos) com o pagamento (antes ${salesBefore}, depois ${salesAfter}) — antes da correção ficava igual`);
  check(paid >= billTotal, `1.4 "Pagamentos recebidos" do dia inclui o pagamento (${paid} FCFA)`);
  await g.goto(C + '/admin/pagamentos?r=hoje', { waitUntil: 'networkidle' });
  const row = await g.locator(`[data-testid="payment-${pid}"]`).innerText();
  check(digits(row.split('·')[0]) === billTotal && /Orange Money/.test(row) && /Mesa 7/.test(row) && /\d{2}\/\d{2}, \d{2}:\d{2}/.test(row) && /REC-\d{6}/.test(row),
    '1.5 lista de pagamentos: valor, método, mesa, data/hora e número do recibo');
  check(digits(await g.locator('[data-testid="payments-total"]').innerText()) >= billTotal, '1.6 total recebido na página de Pagamentos inclui o pagamento');

  // ---------- 2. Relatórios: página, CSV e PDF para o Gerente ----------
  await g.goto(C + '/admin/relatorios?r=hoje', { waitUntil: 'networkidle' });
  const repSales = digits(await g.locator('[data-testid="rep-days"] [data-total="Vendas (FCFA)"]').innerText());
  check(repSales === salesAfter, `2.1 Relatórios: vendas do dia = Visão geral (${repSales} FCFA)`);
  check(/Orange Money/.test(await g.locator('[data-testid="rep-payments"]').innerText()), '2.2 Relatórios: secção "Pagamentos" com cada pagamento');
  const csvRes = await g.context().request.get(`${C}/admin/relatorios/csv?tipo=pagamentos&r=hoje`);
  const csv = await csvRes.text();
  check(csvRes.status() === 200 && csv.charCodeAt(0) === 0xfeff && /^﻿Recibo;Data;Hora;Mesa;Método;Estado;Valor \(FCFA\)/.test(csv) && csv.includes('Orange Money') && csv.includes(String(billTotal)),
    '2.3 CSV de pagamentos (Gerente): Excel-PT (BOM, ";"), cabeçalho e o pagamento real');
  const empty = await (await g.context().request.get(`${C}/admin/relatorios/csv?tipo=dias&r=custom&de=2020-01-01&ate=2020-01-02`)).text();
  check(/^﻿Data;Pedidos;Concluídos;Vendidos;Vendas \(FCFA\)/.test(empty), '2.4 período sem dados → CSV com cabeçalho (antes saía um ficheiro vazio)');
  for (const t of ['dias', 'produtos', 'categorias', 'mesas', 'pedidos']) {
    const r = await g.context().request.get(`${C}/admin/relatorios/csv?tipo=${t}&r=hoje`);
    check(r.status() === 200 && /attachment; filename="nokau-/.test(r.headers()['content-disposition'] ?? ''), `2.5 CSV "${t}" descarrega (Gerente)`);
  }
  const [dl] = await Promise.all([g.waitForEvent('download'), g.locator('[data-testid="report-pdf"]').click()]);
  const pdf = `${S}/auditoria-relatorio.pdf`; await dl.saveAs(pdf);
  const txt = execSync(`pdftotext -layout ${pdf} -`).toString().replace(/[  ]/g, ' ');
  const imgs = execSync(`pdfimages -list ${pdf}`).toString().split('\n').slice(2).filter(Boolean);
  check(fs.readFileSync(pdf).subarray(0, 5).toString() === '%PDF-' && imgs.length >= 1, `2.6 PDF (Gerente) com o logótipo do Nô Kau (${imgs.length} imagem/página)`);
  check(/Pagamentos \(lista completa\)/.test(txt) && /Orange Money/.test(txt) && /REC-\d{6}/.test(txt) && /Pagamentos recebidos/i.test(txt) && /Vendas \(concluídos ou pagos\)/i.test(txt) && !/ou pagos ou pagos/.test(txt),
    '2.7 PDF com todas as informações financeiras: vendas, pagamentos por método e lista de pagamentos com recibo');
  const fmt = (n) => new Intl.NumberFormat('pt-PT', { useGrouping: 'always' }).format(n).replace(/\s/g, ' ');
  check(txt.includes(`${fmt(salesAfter)} FCFA`), `2.8 PDF: vendas = ${fmt(salesAfter)} FCFA (as mesmas da página)`);
  execSync(`pdftoppm -png -r 60 -f 1 -l 1 ${pdf} ${S}/auditoria-pdf`);

  // ---------- 3. Anulação: só com motivo e mantém o histórico ----------
  await g.goto(C + '/admin/pagamentos?r=hoje', { waitUntil: 'networkidle' });
  const r2 = g.locator(`[data-testid="payment-${pid}"]`);
  await r2.getByRole('button', { name: 'Anular…' }).click();
  check(await r2.getByRole('button', { name: 'Confirmar anulação' }).isDisabled(), '3.1 sem motivo não se anula');
  await r2.locator('input').fill('Cliente pagou na mesa errada');
  await r2.getByRole('button', { name: 'Confirmar anulação' }).click();
  await waitFor(() => g.locator(`[data-testid="payment-${pid}"][data-status="voided"]`).isVisible(), 10000);
  check(cq(`select status||'|'||void_reason from payments where id = '${pid}'`) === 'voided|Cliente pagou na mesa errada' && /Pedidos: #\d{4}/.test(await g.locator(`[data-testid="payment-${pid}"]`).innerText()),
    '3.2 anulado com motivo; o pagamento continua no histórico com os pedidos');
  await g.goto(C + '/admin/dashboard?r=hoje', { waitUntil: 'networkidle' });
  check(Number(await g.locator('[data-testid="hero-revenue"]').getAttribute('data-raw')) === salesBefore, '3.3 depois de anulado (e pedido não concluído) deixa de contar nas vendas');
  let del = false; try { cq(`delete from payments where id = '${pid}'`); } catch { del = true; }
  check(del, '3.4 a base de dados recusa apagar pagamentos');

  // ---------- 4. Perfil de visitante (reservas sem palavra-passe) ----------
  const vctx = await b.newContext({ ...devices['Pixel 7'] }); const v = await vctx.newPage();
  v.on('pageerror', (e) => errs.push('visitante: ' + e.message.slice(0, 150)));
  await v.goto(C + '/', { waitUntil: 'load' });
  check(/\/$/.test(v.url()) && !(await v.locator('text=Criar conta').first().isVisible().catch(() => false)), '4.1 o site continua público, sem cadastro');
  const phone = `96${RUN}1`;
  const reserve = async (page, { name, email = '', date = day(2), time = '20:00', guests = '3', ph = phone }) => {
    await page.goto(C + '/reservas', { waitUntil: 'load' });
    const f = page.locator('form').filter({ has: page.locator('input[name=guests]') });
    await f.locator('input[name=name]').fill(name); await f.locator('input[name=phone]').fill(ph); await f.locator('input[name=email]').fill(email);
    await f.locator('input[name=date]').fill(date); await f.locator('input[name=time]').fill(time); await f.locator('input[name=guests]').fill(guests);
    await f.getByRole('button', { name: 'Pedir reserva' }).click();
  };
  await reserve(v, { name: 'Binta' });
  check(await waitFor(() => v.locator('text=Indique o nome completo (nome e apelido).').isVisible(), 8000), '4.2 nome completo obrigatório');
  await reserve(v, { name: 'Binta Sanhá' });
  check(await v.waitForURL(/\/reserva\/[A-Za-z0-9_-]+\?nova=1/, { timeout: 20000 }).then(() => true, () => false), '4.3 reserva sem email e sem palavra-passe → aceite');
  const code1 = cq(`select code from reservations where phone = '${phone}' order by created_at desc limit 1`);
  check(cq(`select coalesce(email,'(vazio)') from reservations where code = '${code1}'`) === '(vazio)', '4.4 email opcional (guardado vazio)');
  check(cq(`select v.name||'|'||v.phone from visitors v join visitor_reservations vr on vr.visitor_id = v.id join reservations r on r.id = vr.reservation_id where r.code = '${code1}'`) === `Binta Sanhá|+245${phone}`,
    '4.5 perfil do visitante criado e guardado automaticamente (nome e telefone)');
  await v.locator('[data-testid="my-reservations-link"]').click(); await v.waitForURL(/\/minhas-reservas/);
  check(/Olá, Binta/.test(await v.locator('[data-testid="visitor-profile"]').innerText()) && (await v.locator('[data-testid="visitor-reservation"]').count()) === 1, '4.6 "As minhas reservas": perfil e a reserva, sem palavra-passe');
  await reserve(v, { name: 'Binta Sanhá', email: `binta${RUN}@exemplo.test`, date: day(5), time: '21:00' });
  await v.waitForURL(/\/reserva\//, { timeout: 20000 });
  await v.goto(C + '/minhas-reservas', { waitUntil: 'load' });
  check((await v.locator('[data-testid="visitor-reservation"]').count()) === 2 && cq(`select count(*) from visitors where phone = '+245${phone}'`) === '1', '4.7 segunda reserva no mesmo aparelho → o mesmo perfil, duas reservas');
  // gerente aprova → o visitante acompanha
  const rid = cq(`select id from reservations where code = '${code1}'`);
  await g.goto(C + '/admin/reservas', { waitUntil: 'networkidle' });
  const card = g.locator(`[data-testid="reservation-${code1}"]`);
  check(/Email\s*—/.test(await card.innerText()), '4.9 painel do gerente: reserva sem email mostra "—"');
  await card.getByRole('button', { name: 'Aprovar' }).click();
  await waitFor(() => cq(`select status from reservations where id = '${rid}'`) === 'approved', 10000);
  check(cq(`select status||'|'||decided_by from reservations where id = '${rid}'`) === 'approved|Gerente Auditoria', '4.8a gerente aprova a reserva no painel');
  await v.reload({ waitUntil: 'load' });
  check(await v.locator(`[data-testid="visitor-reservation"][data-status="approved"]`).count() === 1, '4.8 o visitante vê a reserva aprovada pelo gerente');
  // outro aparelho: não vê nada; só com telefone + código, e só essa reserva
  const octx = await b.newContext({ ...devices['iPhone 13'] }); const o2 = await octx.newPage();
  await o2.goto(C + '/minhas-reservas', { waitUntil: 'load' });
  check(await o2.locator('[data-testid="visitor-empty"]').isVisible() && await o2.locator('[data-testid="visitor-reservation"]').count() === 0, '4.10 outro aparelho não vê as reservas de ninguém');
  const claim = async (page, ph, code) => { const f = page.locator('[data-testid="claim-form"]'); await f.locator('input[name=phone]').fill(ph); await f.locator('input[name=code]').fill(code); await f.getByRole('button', { name: 'Juntar reserva' }).click(); };
  await claim(o2, phone, 'R-ZZZZZZ');
  check(await waitFor(() => o2.locator('text=Não encontrámos uma reserva com esse código e esse telefone.').isVisible(), 8000), '4.11 código errado → recusado');
  await claim(o2, '955555555', code1);
  check(await waitFor(() => o2.locator('text=Não encontrámos uma reserva com esse código e esse telefone.').isVisible(), 8000), '4.12 código certo com telefone errado → recusado');
  await claim(o2, phone, code1.toLowerCase());
  await o2.waitForURL(/\/minhas-reservas/); await o2.waitForLoadState('load');
  check(await waitFor(() => o2.locator('[data-testid="visitor-reservation"]').count().then((n) => n === 1), 8000), '4.13 telefone + código → só essa reserva aparece neste aparelho (a outra não)');
  // quem conhece o telefone e faz uma reserva com ele NÃO passa a ver as reservas da Binta
  const actx = await b.newContext(); const at = await actx.newPage();
  await reserve(at, { name: 'Outra Pessoa', date: day(6), time: '19:00' });
  await at.waitForURL(/\/reserva\//, { timeout: 20000 });
  await at.goto(C + '/minhas-reservas', { waitUntil: 'load' });
  check(await at.locator('[data-testid="visitor-reservation"]').count() === 1, '4.14 reservar com o telefone de outra pessoa NÃO mostra as reservas dela (privacidade)');
  // tentativas limitadas
  cq('delete from auth_throttle');
  cq("update service_calls set status = 'done', done_at = now(), done_by = 'teste', status_changed_at = now() where status in ('open','ack') and table_id = (select id from dining_tables where number = 7)");
  for (let i = 0; i < 5; i++) await claim(at, phone, `R-AAAAA${i}`);
  await claim(at, phone, code1);
  check(await waitFor(() => at.locator('text=Demasiadas tentativas').isVisible(), 8000), '4.15 várias tentativas erradas → bloqueado 15 min');
  cq('delete from auth_throttle');
  cq("update service_calls set status = 'done', done_at = now(), done_by = 'teste', status_changed_at = now() where status in ('open','ack') and table_id = (select id from dining_tables where number = 7)");
  await v.goto(C + '/minhas-reservas', { waitUntil: 'load' });
  await v.locator('[data-testid="visitor-forget"]').click(); await v.waitForURL(/\/minhas-reservas/); await v.waitForLoadState('load');
  check(await waitFor(() => v.locator('[data-testid="visitor-empty"]').isVisible(), 8000), '4.16 "Esquecer este aparelho" → o perfil deixa de aparecer neste aparelho');
  check(cq(`select count(*) from reservations where phone = '${phone}'`) === '3', '4.17 as reservas continuam guardadas (o restaurante não perde nada)');

  // ---------- 5. Botões "Chamar Garçom" / "Chamar Gerente" ----------
  const mctx = await b.newContext({ ...devices['iPhone 13'] }); await AUTH.loginClient(mctx, C); const m = await mctx.newPage();
  await m.goto(`${C}/m/${tok}`, { waitUntil: 'networkidle' });
  const dims = await m.evaluate(() => [...document.querySelectorAll('[data-testid^="call-"]')].filter((e) => e.tagName === 'BUTTON').map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(r.height), fs: parseFloat(getComputedStyle(e).fontSize), fw: getComputedStyle(e).fontWeight }; }));
  const waiter = dims.find((d) => /empregado|Garçom/i.test(d.t)), mgr = dims.find((d) => /Gerente/i.test(d.t));
  check(!!waiter && !!mgr && waiter.h >= 80 && mgr.h >= 80 && waiter.fs >= 14 && Number(waiter.fw) >= 600, `5.1 "Chamar Garçom"/"Chamar Gerente" maiores e mais visíveis (${waiter?.h}px de altura, letra ${waiter?.fs}px, peso ${waiter?.fw}; antes 64px / 12px / 500)`);
  const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 1, '5.2 sem deslocamento horizontal no telemóvel');
  await m.locator('[data-testid="table-help"]').screenshot({ path: `${S}/auditoria-botoes.png` });
  await m.locator('[data-testid="call-waiter"]').click();
  check(await waitFor(() => m.locator('[data-testid="call-status"]').first().isVisible(), 10000), '5.3 o botão continua a funcionar (chamada criada)');

  await b.close();
  cq("delete from admin_users where email = 'gerente.aud@nokau.test'");
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
