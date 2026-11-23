/* Gestão de Estoque: registo, entradas, saídas, contagem, mínimo, alertas, venda ao concluir, estorno, esgotado automático,
   tempo real entre dois gestores, histórico imutável, CSV, permissões, servidor local → central, ecrãs móveis. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process'); const crypto = require('node:crypto');
const S = __dirname;
const AUTH = require(`${S}/auth-helper.js`);
const C = 'http://localhost:3100', L = 'http://localhost:3200';
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tA -q -v ON_ERROR_STOP=1`, { input: s }).toString().trim();
const cq = (s) => q('nokau_test', s), lq = (s) => q('nokau_local', s);
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }
const hashPw = (pw) => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; };
let kn = 0; const key = () => `estoque${Date.now().toString(36)}${(kn++).toString().padStart(6, '0')}`;

(async () => {
  execSync(`${S}/servers.sh both`, { stdio: 'pipe' });
  await waitFor(() => cq("select count(*) from pg_trigger where tgname = 'order_items_stock_trg'") === '1' || (fetch(C + '/admin/login').then(() => false)), 60000);
  cq('delete from auth_throttle');
  cq("delete from admin_users where email like 'stock.%@nokau.test'");
  cq(`insert into admin_users (email, password_hash, role, name) values
      ('stock.gerente@nokau.test', '${hashPw('stock-pass-1')}', 'gerente', 'Gerente Stock'),
      ('stock.admin@nokau.test', '${hashPw('stock-pass-1')}', 'admin', 'Admin Stock'),
      ('stock.garcom@nokau.test', '${hashPw('stock-pass-1')}', 'garcom', 'Garcom Stock')`);
  const item = Number(cq("select id from menu_items where name = 'Sumol' and active and not is_demo limit 1"));
  const price = Number(cq(`select price from menu_items where id = ${item}`));
  cq(`delete from stock_levels where menu_item_id = ${item}`);
  cq(`update menu_items set available = true where id = ${item}`);
  // mesa com menos pedidos recentes (o limite de 20 pedidos/mesa/10 min protege contra abusos)
  const T = Number(cq("select number from dining_tables t where active order by (select count(*) from orders o where o.table_id = t.id and o.created_at > now() - interval '10 minutes'), number limit 1"));
  const tok = cq(`select qr_token from dining_tables where number = ${T}`);
  const before0 = Number(cq(`select count(*) from stock_movements where menu_item_id = ${item}`));
  const maxId0 = Number(cq('select coalesce(max(id),0) from stock_movements'));
  const b = await chromium.launch();
  const login = async (email, base = C, opts = { viewport: { width: 1366, height: 950 } }) => {
    const ctx = await b.newContext({ ...opts, acceptDownloads: true }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${email}: ${e.message.slice(0, 150)}`));
    await p.goto(base + '/admin/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'stock-pass-1'); await p.click('button[type=submit]');
    await p.waitForURL(/\/admin\/(dashboard|mesas)/, { waitUntil: 'commit', timeout: 20000 }); return p;
  };
  const card = (p) => p.locator(`[data-testid="stock-${item}"]`);
  const qty = async (p) => Number(await card(p).getAttribute('data-qty'));
  const dbQty = () => Number(cq(`select quantity from stock_levels where menu_item_id = ${item}`));
  const order = async (n) => {
    const r = await fetch(`${C}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(C) }, body: JSON.stringify({ token: tok, key: key(), lines: [{ itemId: item, quantity: n }] }) });
    return { status: r.status, body: await r.json() };
  };
  const form = async (p, mode, value, reason) => {
    await card(p).locator(`[data-testid="stock-btn-${mode}"]`).click();
    const f = card(p).locator('[data-testid="stock-form"]');
    await f.locator('input[name=qty]').fill(String(value));
    if (reason != null) await f.locator('input[name=reason]').fill(reason);
    await f.locator('[data-testid="stock-form-submit"]').click();
  };

  // ---------- 1. menu lateral e permissões ----------
  const g = await login('stock.gerente@nokau.test');
  const a = await login('stock.admin@nokau.test');
  const w = await login('stock.garcom@nokau.test');
  check(await g.locator('[data-testid="panel-sidebar"] [data-testid="nav-estoque"]').isVisible() && await a.locator('[data-testid="panel-sidebar"] [data-testid="nav-estoque"]').isVisible(), '1.1 "Estoque" no menu lateral do Gerente e do Admin');
  check(await w.locator('[data-testid="nav-estoque"]').count() === 0, '1.2 Garçom não vê "Estoque"');
  await w.goto(C + '/admin/estoque');
  check(await w.waitForURL(/\/admin\/mesas/, { timeout: 15000 }).then(() => true, () => false), '1.3 Garçom pelo endereço → enviado para Mesas');
  check((await w.context().request.get(`${C}/admin/estoque/csv?lista=1`)).status() === 403, '1.4 Garçom não descarrega o CSV do stock (403)');

  // ---------- 2. registar produto ----------
  await g.goto(C + '/admin/estoque', { waitUntil: 'networkidle' });
  await g.locator('[data-testid="stock-track"] summary').click();
  await g.locator('[data-testid="stock-track"] select[name=item]').selectOption(String(item));
  await g.locator('[data-testid="stock-track"] input[name=initial]').fill('6');
  await g.locator('[data-testid="stock-track"] input[name=min]').fill('2');
  await g.locator('[data-testid="stock-track-submit"]').click();
  check(await waitFor(() => card(g).isVisible(), 10000) && await qty(g) === 6 && dbQty() === 6 && await card(g).getAttribute('data-status') === 'ok', '2.1 produto registado com quantidade 6 e mínimo 2 (estado OK)');
  check(cq(`select kind||'|'||delta||'|'||quantity_after||'|'||actor from stock_movements where menu_item_id = ${item} order by id desc limit 1`) === 'inicial|6|6|Gerente Stock', '2.2 histórico: registo inicial +6 por "Gerente Stock"');
  check(!(await g.locator('[data-testid="stock-track"] select[name=item] option', { hasText: 'Sumol' }).count()), '2.3 o produto deixa de aparecer na lista "por registar"');

  // admin com a página aberta (tempo real)
  await a.goto(C + '/admin/estoque', { waitUntil: 'networkidle' });
  check(await qty(a) === 6, '2.4 outro gestor vê o mesmo stock');

  // ---------- 3. entrada, saída, contagem ----------
  await form(g, 'entrada', 4, 'Compra fornecedor');
  check(await waitFor(async () => await qty(g) === 10) && dbQty() === 10, '3.1 entrada +4 → 10');
  check(await waitFor(async () => await qty(a) === 10, 8000), '3.2 tempo real: o outro gestor vê 10 sem recarregar');
  await card(g).locator('[data-testid="stock-btn-saida"]').click();
  await card(g).locator('[data-testid="stock-form"] input[name=qty]').fill('1');
  await card(g).locator('[data-testid="stock-form-submit"]').click();
  check(await card(g).locator('[data-testid="stock-form"] input[name=reason]').evaluate((e) => !e.validity.valid) && dbQty() === 10, '3.3 saída sem motivo não é aceite');
  await card(g).locator('[data-testid="stock-form"] input[name=reason]').fill('Garrafa partida');
  await card(g).locator('[data-testid="stock-form-submit"]').click();
  check(await waitFor(async () => await qty(g) === 9) && dbQty() === 9, '3.4 saída −1 (Garrafa partida) → 9');
  await form(g, 'saida', 50, 'teste');
  check(await waitFor(() => card(g).locator('text=Só há 9 em stock').isVisible(), 8000) && dbQty() === 9, '3.5 saída maior que o stock → recusada com explicação');
  await card(g).getByRole('button', { name: 'Cancelar' }).click();
  await form(g, 'contagem', 7, 'Inventário semanal');
  check(await waitFor(async () => await qty(g) === 7) && cq(`select kind||'|'||delta||'|'||reason from stock_movements where menu_item_id = ${item} order by id desc limit 1`) === 'ajuste|-2|Inventário semanal', '3.6 contagem 7 → ajuste −2 registado com motivo');

  // ---------- 4. vendas: descontam ao CONCLUIR ----------
  const o1 = await order(3);
  check(o1.status === 201 || o1.status === 200, `4.1 pedido real do cliente: 3 × Sumol (#${o1.body.number})`);
  await sleep(1500);
  check(dbQty() === 7, '4.2 pedido recebido (Pendente) não desconta');
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  const oc = g.locator(`[data-testid="order-${o1.body.number}"]`);
  await oc.getByRole('button', { name: 'Iniciar preparação' }).click();
  await waitFor(() => oc.getAttribute('data-status').then((s) => s === 'preparing'));
  await sleep(800);
  check(dbQty() === 7, '4.3 Em preparação não desconta');
  await oc.getByRole('button', { name: 'Marcar concluído' }).click();
  check(await waitFor(() => dbQty() === 4, 8000), '4.4 Concluído → desconta 3 (7 → 4)');
  check(await waitFor(async () => await qty(a) === 4, 8000), '4.5 tempo real: a página Estoque aberta mostra 4 sem recarregar');
  check(cq(`select kind||'|'||delta||'|'||reason||'|'||actor from stock_movements where menu_item_id = ${item} order by id desc limit 1`) === `venda|-3|Pedido #${String(o1.body.number).padStart(4, '0')}|Sistema (pedidos)`, '4.6 histórico: venda −3 com o número do pedido');
  await oc.getByRole('button', { name: /Em preparação/ }).click();
  check(await waitFor(() => dbQty() === 7, 8000) && await waitFor(async () => await qty(a) === 7, 8000), '4.7 pedido volta a "Em preparação" → stock reposto (7), também em tempo real');
  await oc.getByRole('button', { name: 'Marcar concluído' }).click();
  check(await waitFor(() => dbQty() === 4, 8000) && cq(`select count(*) from stock_movements where order_id = '${o1.body.orderId}'`) === '3', '4.8 concluído outra vez → 4 (venda, estorno, venda — sem duplicar)');

  // ---------- 5. alertas: a acabar e esgotado ----------
  const o2 = await order(2);
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  const oc2 = g.locator(`[data-testid="order-${o2.body.number}"]`);
  await oc2.getByRole('button', { name: 'Iniciar preparação' }).click(); await waitFor(() => oc2.getAttribute('data-status').then((s) => s === 'preparing'));
  await oc2.getByRole('button', { name: 'Marcar concluído' }).click();
  check(await waitFor(() => dbQty() === 2, 8000), '5.1 segundo pedido concluído → 2 (= mínimo)');
  check(await waitFor(async () => (await card(a).getAttribute('data-status')) === 'low', 8000) && await a.locator('[data-testid="stock-alert"]').isVisible(), '5.2 alerta automático "A acabar" na página (tempo real)');
  check(await waitFor(() => a.locator('[data-testid="panel-sidebar"] [data-testid="badge-estoque"]').innerText().then((t) => Number(t) >= 1), 8000), '5.3 contador de alertas em "Estoque" no menu lateral');
  await a.locator('[data-testid="bell"]').click();
  check(await a.locator('[data-testid="bell-stock"]').isVisible() && /Sumol \(2\)/.test(await a.locator('[data-testid="bell-stock"]').innerText()), '5.4 sino de notificações: "Stock: … a acabar — Sumol (2)"');
  await a.keyboard.press('Escape');
  const o3 = await order(2);
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  const oc3 = g.locator(`[data-testid="order-${o3.body.number}"]`);
  await oc3.getByRole('button', { name: 'Iniciar preparação' }).click(); await waitFor(() => oc3.getAttribute('data-status').then((s) => s === 'preparing'));
  await oc3.getByRole('button', { name: 'Marcar concluído' }).click();
  check(await waitFor(() => dbQty() === 0, 8000), '5.5 terceiro pedido → 0');
  check(cq(`select available::text||'|'||(select soldout_by_stock::text from stock_levels where menu_item_id = ${item}) from menu_items where id = ${item}`) === 'false|true', '5.6 esgotado automático: o produto sai do menu');
  check(await waitFor(async () => (await card(a).getAttribute('data-status')) === 'out', 8000) && /esgotado \(automático\)/.test(await card(a).innerText()), '5.7 página mostra "Esgotado" e "esgotado (automático)" no menu');
  const blocked = await order(1);
  check(blocked.status === 409, `5.8 cliente já não consegue pedir o produto esgotado (HTTP ${blocked.status})`);
  const mctx = await b.newContext({ ...devices['iPhone 13'] }); await AUTH.loginClient(mctx, C); const m = await mctx.newPage();
  await m.goto(`${C}/m/${tok}`, { waitUntil: 'networkidle' });
  const sumolCard = m.locator('article, li').filter({ hasText: 'Sumol' }).first();
  check(/esgotado|indispon/i.test(await sumolCard.innerText().catch(() => '')), '5.9 menu QR do cliente mostra o Sumol como esgotado/indisponível');

  // ---------- 6. reposição ----------
  await a.goto(C + '/admin/estoque', { waitUntil: 'networkidle' });
  await form(a, 'entrada', 12, 'Compra semanal');
  check(await waitFor(() => dbQty() === 12, 8000) && cq(`select available from menu_items where id = ${item}`) === 't', '6.1 entrada 12 → volta a estar disponível no menu automaticamente');
  const again = await order(1);
  check(again.status === 201 || again.status === 200, '6.2 cliente volta a conseguir pedir');
  await form(a, 'definicoes', 15);
  check(await waitFor(async () => (await card(a).getAttribute('data-status')) === 'low', 8000), '6.3 mínimo alterado para 15 → 12 passa a "A acabar"');

  // ---------- 7. histórico, filtros, CSV, imutável ----------
  await a.goto(`${C}/admin/estoque?produto=${item}&tipo=venda`, { waitUntil: 'networkidle' });
  const kinds = await a.locator('[data-testid="stock-movement"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  check(kinds.length >= 4 && kinds.every((k) => k === 'venda'), `7.1 filtro do histórico (só vendas do Sumol: ${kinds.length})`);
  await a.goto(`${C}/admin/estoque?produto=${item}`, { waitUntil: 'networkidle' });
  const all = await a.locator('[data-testid="stock-movement"]').count();
  const seq = cq(`select string_agg(kind, ',' order by id) from stock_movements where menu_item_id = ${item} and id > ${maxId0}`);
  check(seq === 'inicial,entrada,saida,ajuste,venda,estorno,venda,venda,venda,entrada' && Number(cq(`select count(*) from stock_movements where menu_item_id = ${item}`)) === all, `7.2 histórico completo e por ordem: ${all} movimentos (${seq})`);
  const csv = await (await a.context().request.get(`${C}/admin/estoque/csv?produto=${item}`)).text();
  check(/^﻿Data;Hora;Produto;Tipo;Quantidade;Fica com;Motivo;Por/.test(csv) && csv.includes('Venda revertida') && csv.includes('Garrafa partida'), '7.3 CSV do histórico (Excel PT)');
  const csvList = await (await a.context().request.get(`${C}/admin/estoque/csv?lista=1`)).text();
  check(csvList.split('\n').some((l) => l.startsWith('Sumol;') && l.includes(';12;15;A acabar;')), '7.4 CSV do stock atual');
  let immut = 0; for (const s of [`update stock_movements set delta = 0 where menu_item_id = ${item}`, `delete from stock_movements where menu_item_id = ${item}`]) { try { cq(s); } catch { immut++; } }
  check(immut === 2, '7.5 histórico imutável (a base de dados recusa alterar ou apagar)');

  // ---------- 8. servidor local → central ----------
  const lt = await waitFor(() => lq(`select count(*) from menu_items where id = ${item} and available`) === '1', 30000);
  const ltok = lq(`select qr_token from dining_tables where number = ${T}`);
  const lo = await fetch(`${L}/api/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: AUTH.clientCookie(L) }, body: JSON.stringify({ token: ltok, key: key(), lines: [{ itemId: item, quantity: 2 }] }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  check(lt && (lo.status === 201 || lo.status === 200), `8.1 pedido feito no servidor LOCAL do restaurante (L${lo.body.number})`);
  await waitFor(() => lq("select count(*) from admin_users where email = 'stock.gerente@nokau.test'") === '1', 30000);
  const lp = await login('stock.gerente@nokau.test', L);
  await lp.goto(L + '/admin/pedidos', { waitUntil: 'networkidle' });
  const lc = lp.locator(`[data-testid="order-L${lo.body.number}"]`);
  await lc.getByRole('button', { name: 'Iniciar preparação' }).click(); await waitFor(() => lc.getAttribute('data-status').then((s) => s === 'preparing'));
  await lc.getByRole('button', { name: 'Marcar concluído' }).click();
  check(await waitFor(() => dbQty() === 10, 30000), `8.2 concluído no local → sincronizado → o central desconta (12 → ${dbQty()})`);
  check(cq(`select reason from stock_movements where menu_item_id = ${item} order by id desc limit 1`) === `Pedido L${String(lo.body.number).padStart(4, '0')}`, '8.3 histórico do central regista a venda do pedido local');
  await lp.goto(L + '/admin/estoque', { waitUntil: 'networkidle' });
  check(await lp.locator('[data-testid="local-readonly"]').isVisible() && await lp.locator('[data-testid="stock-track"]').count() === 0, '8.4 no servidor local a página Estoque é só de leitura (gere-se no central)');

  // ---------- 9. telemóvel ----------
  const gm = await login('stock.gerente@nokau.test', C, { ...devices['Pixel 7'] });
  await gm.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  await gm.locator('header [data-testid="menu-button"]').click();
  await gm.locator('#painel-menu [data-testid="nav-estoque"]').click();
  await gm.waitForURL(/\/admin\/estoque/);
  await gm.waitForSelector(`[data-testid="stock-${item}"]`);
  const ov = await gm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 1, '9.1 telemóvel: Estoque pelo menu lateral, sem deslocamento horizontal');
  await card(gm).locator('[data-testid="stock-btn-entrada"]').click();
  const bx = await card(gm).locator('[data-testid="stock-form-submit"]').boundingBox();
  check(bx && bx.height >= 44 && bx.x + bx.width <= 412, '9.2 telemóvel: formulário de entrada usável (botões ≥ 44px, dentro do ecrã)');
  await gm.screenshot({ path: `${S}/estoque-telemovel.png`, fullPage: false });
  await a.goto(C + '/admin/estoque', { waitUntil: 'networkidle' });
  await a.screenshot({ path: `${S}/estoque-computador.png`, fullPage: false });

  // ---------- 10. deixar de controlar ----------
  await a.goto(C + '/admin/estoque', { waitUntil: 'networkidle' });
  await card(a).locator('[data-testid="stock-btn-definicoes"]').click();
  await card(a).locator('[data-testid="stock-untrack"]').click();
  await card(a).locator('[data-testid="stock-untrack-confirm"]').click();
  check(await waitFor(async () => (await card(a).count()) === 0, 8000) && cq(`select count(*) from stock_levels where menu_item_id = ${item}`) === '0'
    && Number(cq(`select count(*) from stock_movements where menu_item_id = ${item}`)) > before0, '10.1 deixar de controlar: sai da lista, o histórico fica');
  const o4 = await order(1);
  await g.goto(C + '/admin/pedidos', { waitUntil: 'networkidle' });
  const oc4 = g.locator(`[data-testid="order-${o4.body.number}"]`);
  await oc4.getByRole('button', { name: 'Iniciar preparação' }).click(); await waitFor(() => oc4.getAttribute('data-status').then((s) => s === 'preparing'));
  await oc4.getByRole('button', { name: 'Marcar concluído' }).click(); await sleep(1500);
  check(cq(`select count(*) from stock_movements where order_id = '${o4.body.orderId}'`) === '0', '10.2 produto sem controlo de stock: as vendas não criam movimentos');

  await b.close();
  cq("delete from admin_users where email like 'stock.%@nokau.test'");
  execSync(`${S}/servers.sh stop-local`, { stdio: 'pipe' });
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n').slice(0, 4).join(' | ')); console.log('ok:', ok, '\nfalhas:', bad, '\nerros:', errs); process.exit(1); });
