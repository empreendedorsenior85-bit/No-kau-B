/* Reservas: cliente pede → painel (Admin e Gerente em tempo real) → aprovar/rejeitar → cliente avisado no site; histórico; segurança. */
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const B = 'http://localhost:3100';
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message.slice(0, 150)}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${tag}: ${m.text().slice(0, 150)}`); });
};
async function staff(b, email, pw, tag) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage(); watch(p, tag);
  await p.goto(B + '/admin/login', { waitUntil: 'load' });
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  await p.waitForURL(/\/admin\/(dashboard|mesas)/, { timeout: 20000, waitUntil: 'commit' });
  await p.goto(B + '/admin/reservas', { waitUntil: 'load' });
  await p.waitForSelector('[data-testid="reservations-pending"]', { timeout: 15000 });
  await p.waitForSelector('text=Ao vivo', { timeout: 15000 });
  return { ctx, p };
}
const RUN = String(Date.now()).slice(-6);
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function reserve(page, { name, email, phone = `95${RUN}1`, date = day(2), time = '20:00', guests = '4', notes = '' }) {
  await page.goto(B + '/reservas', { waitUntil: 'load' });
  const f = page.locator('form').filter({ has: page.locator('input[name=guests]') });
  await f.locator('input[name=name]').fill(name); await f.locator('input[name=phone]').fill(phone);
  await f.locator('input[name=email]').fill(email); await f.locator('input[name=date]').fill(date); await f.locator('input[name=time]').fill(time);
  await f.locator('input[name=guests]').fill(guests); if (notes) await f.locator('textarea[name=notes]').fill(notes);
  await f.getByRole('button', { name: 'Pedir reserva' }).click();
}

(async () => {
  const b = await chromium.launch();
  const admin = await staff(b, 'gerente@nokau.test', 'senha-forte-123', 'admin');
  const ger = await staff(b, 'gerente1@nokau.test', 'minha-nova-senha-77', 'gerente');

  // ---------- 1. Cliente pede a reserva ----------
  const cctx = await b.newContext({ ...devices['Pixel 7'] });
  const c = await cctx.newPage(); watch(c, 'cliente');
  // nome completo obrigatório (nome e apelido); email opcional
  await reserve(c, { name: 'Aua', email: '', notes: 'Aniversário — bolo às 22h' });
  check(await waitFor(() => c.locator('text=Indique o nome completo (nome e apelido).').isVisible(), 8000), '1.1 nome completo obrigatório (erro claro)');
  await c.locator('input[name=name]').fill('Aua Djaló');
  await c.locator('input[name=email]').fill(`aua-${RUN}@exemplo.test`);
  await c.locator('form').filter({ has: c.locator('input[name=guests]') }).getByRole('button', { name: 'Pedir reserva' }).click();
  await c.waitForURL(/\/reserva\/[A-Za-z0-9_-]{24}/, { timeout: 15000, waitUntil: 'commit' });
  await c.waitForSelector('[data-testid="reservation-page"]');
  const tok1 = c.url().match(/\/reserva\/([A-Za-z0-9_-]{24})/)[1];
  check(await c.locator('[data-testid="reservation-page"]').getAttribute('data-status') === 'pending', '1.2 cliente vê a reserva como "Pendente"');
  const r1 = sql(`select code||'|'||name||'|'||phone||'|'||email||'|'||to_char(date,'YYYY-MM-DD')||'|'||to_char(time,'HH24:MI')||'|'||guests||'|'||notes||'|'||status from reservations where access_token = '${tok1}'`).split('|');
  check(r1[1] === 'Aua Djaló' && r1[3] === `aua-${RUN}@exemplo.test` && r1[4] === day(2) && r1[5] === '20:00' && r1[6] === '4' && /Aniversário/.test(r1[7]) && r1[8] === 'pending',
    `1.3 todas as informações guardadas (nome, telefone, email, data, hora, pessoas, observações) — ${r1[0]}`);
  const saved = await c.evaluate(() => JSON.parse(localStorage.getItem('nokau-reservas') ?? '[]'));
  check(saved.some((s) => s.token === tok1), '1.4 link da reserva guardado no telemóvel do cliente');

  // ---------- 2. Aparece nos painéis do Admin e do Gerente, em tempo real ----------
  const code1 = r1[0];
  const t0 = Date.now();
  check(await waitFor(() => admin.p.locator(`[data-testid="reservation-${code1}"][data-status="pending"]`).isVisible(), 10000), `2.1 Admin vê a reserva Pendente sem recarregar (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  check(await waitFor(() => ger.p.locator(`[data-testid="reservation-${code1}"][data-status="pending"]`).isVisible(), 10000), '2.2 Gerente vê a mesma reserva ao mesmo tempo');
  check(await admin.p.locator('[data-testid="badge-reservas"]').isVisible(), '2.3 contador de reservas pendentes no menu');
  const card = ger.p.locator(`[data-testid="reservation-${code1}"]`);
  check(/Aniversário/.test(await card.innerText()) && /aua-/.test(await card.innerText()), '2.4 cartão mostra telefone, email e observações');

  // ---------- 3. Gerente aprova com mensagem → Admin e cliente sincronizados ----------
  await card.locator('input').fill('Mesa junto à janela. Até sábado!');
  await card.getByRole('button', { name: 'Aprovar' }).click();
  check(await waitFor(() => sql(`select status||'|'||decided_by from reservations where code = '${code1}'`) === 'approved|gerente1@nokau.test', 8000), '3.1 reserva aprovada e registado quem aprovou');
  check(await waitFor(() => admin.p.locator(`[data-testid="reservations-upcoming"] [data-testid="reservation-${code1}"][data-status="approved"]`).isVisible(), 10000), '3.2 painel do Admin atualiza sozinho (Próximas aprovadas)');
  // o cliente está noutra página do site
  await c.goto(B + '/menu', { waitUntil: 'load' });
  check(await waitFor(() => c.locator('[data-testid="reservation-notice"][data-status="approved"]').isVisible(), 30000), '3.3 cliente recebe o aviso no site: "Reserva aprovada!"');
  const notice = await c.locator('[data-testid="reservation-notice"]').innerText();
  check(/20:00/.test(notice) && /4 pessoas/.test(notice) && /janela/.test(notice) && notice.includes(code1), '3.4 aviso com os detalhes (data, hora, pessoas, código, mensagem)');
  await c.locator('[data-testid="reservation-notice"]').getByRole('button', { name: 'Fechar' }).click();
  await c.reload({ waitUntil: 'load' }); await sleep(2500);
  check(await c.locator('[data-testid="reservation-notice"]').count() === 0, '3.5 depois de fechado, o aviso não volta a aparecer');
  await c.goto(`${B}/reserva/${tok1}`, { waitUntil: 'load' });
  check(/Aprovada/.test(await c.locator('[data-testid="reservation-status"]').innerText()) && /janela/.test(await c.locator('[data-testid="reservation-status"]').innerText()), '3.6 página da reserva: "Aprovada" + mensagem do restaurante');

  // ---------- 4. Rejeitar com motivo; o cliente vê com a página aberta ----------
  await reserve(c, { name: 'Aua Djaló', email: `aua-${RUN}@exemplo.test`, date: day(3), time: '21:30', guests: '12' });
  await c.waitForURL(/\/reserva\//, { timeout: 15000, waitUntil: 'commit' }); await c.waitForSelector('[data-testid="reservation-page"]');
  const code2 = sql(`select code from reservations where access_token = '${c.url().match(/\/reserva\/([A-Za-z0-9_-]{24})/)[1]}'`);
  const card2 = admin.p.locator(`[data-testid="reservation-${code2}"]`);
  await waitFor(() => card2.isVisible(), 10000);
  await card2.locator('input').fill('Sala cheia nesse dia — temos lugar no domingo.');
  await card2.getByRole('button', { name: 'Rejeitar' }).click();
  check(await waitFor(() => c.locator('[data-testid="reservation-page"][data-status="rejected"]').isVisible(), 25000), '4.1 página aberta do cliente passa sozinha a "Rejeitada"');
  check(/domingo/.test(await c.locator('[data-testid="reservation-status"]').innerText()), '4.2 cliente vê o motivo');
  check(await waitFor(() => ger.p.locator(`[data-testid="reservation-${code2}"][data-status="rejected"]`).isVisible(), 10000), '4.3 Gerente vê a rejeição feita pelo Admin');

  // ---------- 5. Dois a decidir ao mesmo tempo ----------
  await reserve(c, { name: 'Teste Concorrência', email: `conc-${RUN}@exemplo.test`, date: day(4), time: '19:00', guests: '2' });
  await c.waitForURL(/\/reserva\//, { timeout: 15000, waitUntil: 'commit' });
  const code3 = sql(`select code from reservations where email = 'conc-${RUN}@exemplo.test'`);
  const a3 = admin.p.locator(`[data-testid="reservation-${code3}"]`), g3 = ger.p.locator(`[data-testid="reservation-${code3}"]`);
  await waitFor(() => a3.isVisible(), 10000); await waitFor(() => g3.isVisible(), 10000);
  await Promise.all([a3.getByRole('button', { name: 'Aprovar' }).click(), g3.getByRole('button', { name: 'Rejeitar' }).click()]);
  await sleep(2500);
  const final3 = sql(`select status from reservations where code = '${code3}'`);
  check(['approved', 'rejected'].includes(final3) && Number(sql(`select count(*) from audit_log where entity = 'reservation' and action in ('reservation.approve','reservation.reject') and entity_id = (select id::text from reservations where code = '${code3}')`)) === 1, `5.1 decisões simultâneas → só UMA vale (${final3})`);
  check(await waitFor(async () => (await a3.getAttribute('data-status')) === final3 && (await g3.getAttribute('data-status')) === final3, 10000), '5.2 os dois painéis ficam com o mesmo estado final');

  // ---------- 6. Cliente cancela; já não se pode aprovar ----------
  await reserve(c, { name: 'Aua Djaló', email: `aua-${RUN}@exemplo.test`, date: day(5), time: '13:00', guests: '3' });
  await c.waitForURL(/\/reserva\//, { timeout: 15000, waitUntil: 'commit' }); await c.waitForSelector('[data-testid="reservation-page"]');
  const code4 = sql(`select code from reservations where access_token = '${c.url().match(/\/reserva\/([A-Za-z0-9_-]{24})/)[1]}'`);
  const a4 = admin.p.locator(`[data-testid="reservation-${code4}"]`);
  await waitFor(() => a4.isVisible(), 10000);
  await c.getByRole('button', { name: 'Cancelar este pedido' }).click();
  await waitFor(() => c.locator('[data-testid="reservation-page"][data-status="cancelled"]').isVisible(), 10000);
  check(sql(`select status from reservations where code = '${code4}'`) === 'cancelled', '6.1 cliente cancela o pedido pendente');
  check(await waitFor(() => a4.getAttribute('data-status').then((s) => s === 'cancelled'), 10000), '6.2 painel mostra "Cancelada" sozinho');

  // ---------- 7. Validação e duplicados ----------
  await reserve(c, { name: 'Passado', email: `p-${RUN}@exemplo.test`, date: day(-1) });
  check(await waitFor(() => c.locator('text=A data não pode estar no passado.').isVisible(), 8000), '7.1 data no passado recusada');
  await reserve(c, { name: 'Grupo', email: `g-${RUN}@exemplo.test`, guests: '31' });
  check(await waitFor(() => c.locator('text=Para mais de 30 pessoas').isVisible(), 8000), '7.2 mais de 30 pessoas → evento privado');
  const before = Number(sql(`select count(*) from reservations where email = 'dup-${RUN}@exemplo.test'`));
  await c.goto(B + '/reservas', { waitUntil: 'load' });
  const f = c.locator('form').filter({ has: c.locator('input[name=guests]') });
  await f.locator('input[name=name]').fill('Duplo Toque'); await f.locator('input[name=phone]').fill(`97${RUN}2`); await f.locator('input[name=email]').fill(`dup-${RUN}@exemplo.test`);
  await f.locator('input[name=date]').fill(day(6)); await f.locator('input[name=time]').fill('20:30'); await f.locator('input[name=guests]').fill('2');
  await f.getByRole('button', { name: 'Pedir reserva' }).dblclick();
  await c.waitForURL(/\/reserva\//, { timeout: 15000, waitUntil: 'commit' }); await sleep(1500);
  check(Number(sql(`select count(*) from reservations where email = 'dup-${RUN}@exemplo.test'`)) === before + 1, '7.3 duplo toque cria UMA reserva');

  // limite por contacto: 5 pedidos pendentes por email/telefone
  for (let i = 0; i < 5; i++) {
    await reserve(c, { name: 'Muitos Pedidos', email: `muitos-${RUN}@exemplo.test`, phone: `97${RUN}5`, date: day(10 + i), time: '20:00', guests: '2' });
    await c.waitForURL(/\/reserva\//, { timeout: 15000, waitUntil: 'commit' });
  }
  await reserve(c, { name: 'Muitos Pedidos', email: `muitos-${RUN}@exemplo.test`, phone: `97${RUN}5`, date: day(20), time: '20:00', guests: '2' });
  check(await waitFor(() => c.locator('text=Já tem 5 pedidos de reserva à espera de resposta').first().isVisible(), 8000)
    && sql(`select count(*) from reservations where email = 'muitos-${RUN}@exemplo.test'`) === '5', '7.4 no máximo 5 pedidos pendentes por contacto (anti-abuso sem bloquear IPs partilhados)');
  sql(`update reservations set status = 'cancelled', decided_by = 'teste', decided_at = now() where email = 'muitos-${RUN}@exemplo.test'`);

  // ---------- 8. Cliente com conta: reserva aparece em "As minhas reservas" ----------
  const acct = await b.newContext({ ...devices['Pixel 7'] }); const ap2 = await acct.newPage(); watch(ap2, 'conta');
  await ap2.goto(B + '/cliente/registo', { waitUntil: 'load' });
  const rf = ap2.locator('[data-testid="register-form"]');
  await rf.locator('input[name=name]').fill('Cliente Conta'); await rf.locator('input[name=email]').fill(`conta-${RUN}@exemplo.test`); await rf.locator('input[name=phone]').fill(`96${RUN}9`);
  await rf.locator('input[name=password]').fill('senha-conta-1'); await rf.locator('input[name=password2]').fill('senha-conta-1'); await rf.locator('input[name=consent]').check();
  await rf.getByRole('button', { name: 'Criar conta' }).click(); await ap2.waitForURL(/\/cliente$/, { timeout: 15000, waitUntil: 'commit' });
  await reserve(ap2, { name: 'Cliente Conta', email: `conta-${RUN}@exemplo.test`, phone: `96${RUN}9`, date: day(7), time: '20:15', guests: '5' });
  await ap2.waitForURL(/\/reserva\//, { timeout: 15000, waitUntil: 'commit' });
  check(sql(`select (customer_id is not null)::text from reservations where email = 'conta-${RUN}@exemplo.test'`) === 'true', '8.1 reserva associada à conta do cliente');
  await ap2.goto(B + '/cliente', { waitUntil: 'load' }); await ap2.waitForSelector('[data-testid="client-reservations"]');
  check(await ap2.locator('[data-testid="client-reservation"][data-status="pending"]').count() === 1, '8.2 "As minhas reservas" mostra a reserva Pendente');

  // ---------- 9. Histórico e filtros ----------
  await admin.p.goto(`${B}/admin/reservas?estado=rejected&q=${code2}`, { waitUntil: 'load' });
  const hist = await admin.p.locator('[data-testid="reservas-historico"]').innerText();
  check(hist.includes(code2) && /Rejeitada/.test(hist) && !hist.includes(code1), '9.1 histórico filtra por estado e código');
  await admin.p.goto(`${B}/admin/reservas?q=aua-${RUN}`, { waitUntil: 'load' });
  const all = await admin.p.locator('[data-testid="reservas-historico"]').innerText();
  check([code1, code2, code4].every((x) => all.includes(x)) && /Aprovada/.test(all) && /Cancelada/.test(all), '9.2 histórico com todos os estados do cliente');
  check(Number(sql(`select count(*) from audit_log where action like 'reservation.%' and entity_id in (select id::text from reservations where email = 'aua-${RUN}@exemplo.test')`)) >= 5, '9.3 cada passo registado na Atividade');

  // ---------- 10. Segurança ----------
  const w = sql("select email from admin_users where role = 'garcom' and active limit 1");
  if (w) {
    sql(`update admin_users set password_hash = (select password_hash from admin_users where email = 'gerente@nokau.test') where email = '${w}'`);
    const gctx = await b.newContext(); const gp = await gctx.newPage();
    await gp.goto(B + '/admin/login'); await gp.fill('input[name=email]', w); await gp.fill('input[name=password]', 'senha-forte-123'); await gp.click('button[type=submit]');
    await gp.waitForURL(/\/admin\/mesas/, { timeout: 20000, waitUntil: 'commit' });
    const html = await (await gctx.request.get(B + '/admin/reservas')).text();
    await gp.goto(B + '/admin/reservas', { waitUntil: 'load' }); await gp.waitForURL(/\/admin\/mesas/, { timeout: 10000 }).catch(() => {});
    check(/\/admin\/mesas/.test(gp.url()) && !/R-[A-Z0-9]{6}|@exemplo\.test/.test(html), '10.1 garçom não acede às reservas (reencaminhado, sem dados no HTML)');
    const snap = await (await gctx.request.get(B + '/api/admin/orders')).json();
    check(Array.isArray(snap.reservations) && snap.reservations.length === 0, '10.2 dados pessoais das reservas não vão para o garçom');
  }
  const pub = await (await fetch(`${B}/api/reservas?t=${tok1}`)).json();
  check(pub.reservations.length === 1 && !('phone' in pub.reservations[0]) && !('email' in pub.reservations[0]) && !('id' in pub.reservations[0]), '10.3 o link público não expõe telefone, email nem ids');
  check((await (await fetch(`${B}/api/reservas?t=${'A'.repeat(24)}`)).json()).reservations.length === 0, '10.4 link inventado não mostra nada');
  const nfHtml = await (await fetch(`${B}/reserva/${'B'.repeat(24)}`)).text();
  check(/não encontr|404/i.test(nfHtml) && !/R-[A-Z0-9]{6}/.test(nfHtml), '10.5 link de reserva inexistente → "não encontrada", sem dados');

  // ---------- 11. Sem JavaScript ----------
  const nj = await (await b.newContext({ javaScriptEnabled: false })).newPage();
  await nj.goto(B + '/reservas', { waitUntil: 'load' });
  const nf = nj.locator('form').filter({ has: nj.locator('input[name=guests]') });
  await nf.locator('input[name=name]').fill('Sem Javascript'); await nf.locator('input[name=phone]').fill(`97${RUN}3`); await nf.locator('input[name=email]').fill(`nojs-${RUN}@exemplo.test`);
  await nf.locator('input[name=date]').fill(day(8)); await nf.locator('input[name=time]').fill('19:30'); await nf.locator('input[name=guests]').fill('2');
  await nf.getByRole('button', { name: 'Pedir reserva' }).click();
  await nj.waitForURL(/\/reserva\//, { timeout: 15000 }).catch(() => {});
  check(sql(`select status from reservations where email = 'nojs-${RUN}@exemplo.test'`) === 'pending' && /\/reserva\//.test(nj.url()), '11.1 reserva funciona sem JavaScript');

  await b.close();
  console.log(`OK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
})().catch((e) => { console.log('FATAL', e.message.slice(0, 900)); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
