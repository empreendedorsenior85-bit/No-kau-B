/* Dashboard: cada número da interface é comparado com uma consulta SQL independente à base de dados. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const B = 'http://localhost:3100';
const ADMIN = 'gerente@nokau.test', PASS = 'senha-forte-123';
const G1 = 'gerente1@nokau.test', G1PASS = 'minha-nova-senha-77';
const OUT = require('node:path').join(OUTDIR, 'shots', 'dash');
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`, { maxBuffer: 1 << 26 }).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (t) => Number(String(t).replace(/[^\d-]/g, '') || 0);
const pct = (t) => { const m = String(t).replace('−', '-').match(/([+-]?\d+(?:[.,]\d+)?)\s*%/); return m ? Number(m[1].replace(',', '.')) : null; };

// ---- semear dados (só na base de TESTE local) ----
function seed() {
  sql("update menu_categories set active = true where id in ('entradas','principais','casa','tradicionais','acompanhamentos','sobremesas','bebidas')");
  sql("update menu_categories set position = position + 0 where false");
  sql("delete from order_items where order_id in (select id from orders where idempotency_key like 'seed-%')");
  sql("delete from orders where idempotency_key like 'seed-%'");
  sql("delete from menu_items where category_id like 'categoria-teste%'"); sql("delete from menu_categories where id like 'categoria-teste%'");
  sql("delete from order_items where menu_item_id in (select id from menu_items where name like 'Seed %')");
  sql("delete from menu_items where name like 'Seed %'");
  sql("delete from orders where id not in (select order_id from order_items)"); // restos de execuções anteriores
  sql("insert into menu_items (category_id,name,description,price,position) values ('entradas','Seed Bruschetta','x',2500,90),('principais','Seed Frango grelhado','x',4500,91),('principais','Seed Espetada','x',5500,92),('casa','Seed Prato da casa','x',7200,93),('bebidas','Seed Cocktail','x',3000,94),('sobremesas','Seed Gelado','x',2000,95)");
  sql("alter table orders disable trigger orders_touch_trg");
  sql(`insert into orders (table_id,total,is_test,idempotency_key,status,created_at,updated_at)
       select t.id, 0, (g % 17 = 0), 'seed-'||g||'-padpadpadpad',
              (case when g % 9 = 0 then 'pending' when g % 13 = 0 then 'preparing' else 'done' end),
              date_trunc('day', now() at time zone 'UTC') - ((g % 36) || ' days')::interval + ((7 + (g * 7) % 16) || ' hours')::interval + ((g * 13 % 60) || ' minutes')::interval,
              now() - interval '40 days'
       from generate_series(1,150) g join dining_tables t on t.number = 1 + (g % 9)
       where date_trunc('day', now() at time zone 'UTC') - ((g % 36) || ' days')::interval + ((7 + (g * 7) % 16) || ' hours')::interval <= now()`);
  sql(`insert into order_items (order_id, menu_item_id, name, unit_price, quantity, note)
       select o.id, m.id, m.name, m.price, 1 + (abs(hashtext(o.id::text || m.id::text)) % 3), null
       from orders o join lateral (select * from menu_items where name like 'Seed %' order by md5(o.id::text || id::text) limit 1 + (abs(hashtext(o.id::text)) % 3)) m on true
       where o.idempotency_key like 'seed-%'`);
  sql("update orders o set total = coalesce((select sum(quantity*unit_price) from order_items i where i.order_id=o.id),0) where idempotency_key like 'seed-%'");
  // pedido com observação perigosa (injeção de fórmula no CSV)
  const oid = sql("select id from orders where idempotency_key like 'seed-%' and status='done' and not is_test order by created_at desc limit 1");
  sql(`update order_items set note='=HYPERLINK(""http://x"",""clica"")' where id = (select id from order_items where order_id='${oid}' limit 1)`);
  sql(`update order_items set name='=SUM(1+1)' where id = (select id from order_items where order_id='${oid}' order by id desc limit 1)`);
  sql("alter table orders enable trigger orders_touch_trg");
}

const today = () => sql("select to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD')");
const addDays = (d, n) => sql(`select to_char('${d}'::date + ${n},'YYYY-MM-DD')`);
const win = (from, to) => `o.created_at >= timestamptz '${from} 00:00:00+00' and o.created_at < timestamptz '${to} 00:00:00+00'`;
function expected(from, to, test) {
  const f = `${win(from, to)} and (${test} or not o.is_test)`;
  const j = JSON.parse(sql(`select json_build_object('orders',count(*),'done',count(*) filter (where o.status='done'),'sold',count(*) filter (where (o.status='done' or o.payment_id is not null)),'inprog',count(*) filter (where o.status<>'done'),'revenue',coalesce(sum(o.total) filter (where (o.status='done' or o.payment_id is not null)),0),'tables',count(distinct o.table_id)) from orders o where ${f}`));
  j.units = Number(sql(`select coalesce(sum(i.quantity),0) from order_items i join orders o on o.id=i.order_id where (o.status='done' or o.payment_id is not null) and ${f}`));
  j.ticket = j.sold ? Math.round(j.revenue / j.sold) : 0; // Vendas = concluídos ou pagos
  j.topProduct = sql(`select i.name||'|'||sum(i.quantity*i.unit_price) from order_items i join orders o on o.id=i.order_id where (o.status='done' or o.payment_id is not null) and ${f} group by i.name order by sum(i.quantity*i.unit_price) desc, sum(i.quantity) desc limit 1`);
  j.topCat = sql(`select x||'|'||s from (select coalesce(c.label,'Outros') x, sum(i.quantity*i.unit_price) s from order_items i join orders o on o.id=i.order_id left join menu_items m on m.id=i.menu_item_id left join menu_categories c on c.id=m.category_id where (o.status='done' or o.payment_id is not null) and ${f} group by 1) q order by s desc limit 1`);
  j.topTable = sql(`select t.label||'|'||coalesce(sum(o.total) filter (where (o.status='done' or o.payment_id is not null)),0) from orders o join dining_tables t on t.id=o.table_id where ${f} group by t.id,t.label,t.number order by coalesce(sum(o.total) filter (where (o.status='done' or o.payment_id is not null)),0) desc, count(*) desc, t.number limit 1`);
  return j;
}

async function login(ctx, email, pw) {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/401|404|net::ERR/.test(m.text())) errs.push(`${email}: ${m.text().slice(0, 150)}`); });
  p.on('pageerror', (e) => errs.push(`${email} pageerror: ${e.message.slice(0, 150)}`));
  await p.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.click('button[type=submit]');
  await p.waitForURL('**/admin/dashboard', { timeout: 15000 }); await p.waitForSelector('[data-testid="hero-revenue"]');
  return p;
}

async function readDash(p) {
  const t = async (id) => (await p.locator(`[data-testid="${id}"]`).first().innerText());
  const rows = async (id) => (await p.locator(`[data-testid="${id}"] ol li`).evaluateAll((els) => els.map((e) => e.innerText.replace(/\n+/g, '|')))); // "label|valor"
  return {
    revenue: Number(await p.locator('[data-testid="hero-revenue"]').getAttribute('data-raw')),
    done: num(await t('hero-done')), inprog: num(await t('hero-inprogress')),
    orders: num(await p.locator('[data-testid="tile-orders"] [data-value]').innerText()),
    ticket: num(await p.locator('[data-testid="tile-ticket"] [data-value]').innerText()),
    units: num(await p.locator('[data-testid="tile-units"] [data-value]').innerText()),
    tables: num(await p.locator('[data-testid="tile-tables"] [data-value]').innerText()),
    products: await rows('chart-products'), categories: await rows('chart-categories'), tablesRank: await rows('chart-tables'),
  };
}

(async () => {
  seed();
  // Etapa C: para pedir é preciso conta — todos os contextos destes testes são de um cliente com sessão iniciada
  const b = require('./auth-helper.js').clientContexts(await chromium.launch());
  const actx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const ap = await login(actx, ADMIN, PASS);
  const T = today();

  // ---------- 1. números = base de dados, em vários períodos ----------
  const cases = [
    ['7d', `/admin/dashboard`, addDays(T, -6), addDays(T, 1), false],
    ['30d', `/admin/dashboard?r=30d`, addDays(T, -29), addDays(T, 1), false],
    ['hoje', `/admin/dashboard?r=hoje`, T, addDays(T, 1), false],
    ['ontem', `/admin/dashboard?r=ontem`, addDays(T, -1), T, false],
    ['custom', `/admin/dashboard?r=custom&de=${addDays(T, -12)}&ate=${addDays(T, -5)}`, addDays(T, -12), addDays(T, -4), false],
    ['30d+testes', `/admin/dashboard?r=30d&testes=1`, addDays(T, -29), addDays(T, 1), true],
  ];
  for (const [name, url, from, to, test] of cases) {
    await ap.goto(B + url, { waitUntil: 'networkidle' }); await ap.waitForSelector('[data-testid="hero-revenue"]');
    const e = expected(from, to, test); const u = await readDash(ap);
    check(u.revenue === e.revenue, `1.${name} vendas: UI ${u.revenue} = BD ${e.revenue}`);
    check(u.orders === e.orders && u.done === e.done && u.inprog === e.inprog, `1.${name} pedidos/concluídos/em curso: UI ${u.orders}/${u.done}/${u.inprog} = BD ${e.orders}/${e.done}/${e.inprog}`);
    check(u.ticket === e.ticket, `1.${name} ticket médio: UI ${u.ticket} = BD ${e.ticket}`);
    check(u.units === e.units, `1.${name} unidades: UI ${u.units} = BD ${e.units}`);
    check(u.tables === e.tables, `1.${name} mesas: UI ${u.tables} = BD ${e.tables}`);
    if (e.topProduct) { const [n, v] = e.topProduct.split('|'); check(u.products[0]?.startsWith(n) && num(u.products[0]) % 1 === 0 && u.products[0].replace(/\D/g, '').endsWith(String(v)), `1.${name} produto nº1: "${u.products[0]?.replace(/\|/g, ' ')}" = BD ${n} ${v}`); }
    if (e.topCat) { const [n, v] = e.topCat.split('|'); check(u.categories[0]?.startsWith(n) && u.categories[0].replace(/\D/g, '').endsWith(String(v)), `1.${name} categoria nº1: ${u.categories[0]?.replace(/\|/g, ' ')} = BD ${n} ${v}`); }
    if (e.topTable) { const [n, v] = e.topTable.split('|'); check(u.tablesRank[0]?.startsWith(n) && u.tablesRank[0].replace(/\D/g, '').endsWith(String(v)), `1.${name} mesa nº1: ${u.tablesRank[0]?.replace(/\|/g, ' ')} = BD ${n} ${v}`); }
  }

  // ---------- 2. comparação com o período anterior ----------
  await ap.goto(B + '/admin/dashboard?r=7d', { waitUntil: 'networkidle' });
  const e7 = expected(addDays(T, -6), addDays(T, 1), false), p7 = expected(addDays(T, -13), addDays(T, -6), false);
  const deltaTxt = await ap.locator('[data-testid="tile-orders"]').innerText();
  const exp = p7.orders ? ((e7.orders - p7.orders) / p7.orders) * 100 : null;
  check(exp !== null && Math.abs(pct(deltaTxt) - exp) < 0.06, `2.1 variação de pedidos vs período anterior: UI ${pct(deltaTxt)}% = BD ${exp?.toFixed(1)}%`);
  check(await ap.locator('[data-testid="hero-revenue"]').locator('xpath=..').innerText().then((t) => t.includes(String(p7.revenue).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')) || num(t.split('anterior')[1] ?? '') === p7.revenue), `2.2 vendas do período anterior mostradas (BD ${p7.revenue})`);

  // ---------- 3. gráficos: tabela de dados = base de dados ----------
  await ap.locator('[data-testid="chart-sales"] button:has-text("Ver tabela")').click();
  const rowsTxt = await ap.locator('[data-testid="chart-sales"] tbody tr').evaluateAll((trs) => trs.map((r) => [...r.querySelectorAll('td')].map((c) => c.innerText)));
  check(rowsTxt.length === 7, `3.1 gráfico de vendas tem 7 pontos (7 dias): ${rowsTxt.length}`);
  check(rowsTxt.reduce((s, r) => s + num(r[1]), 0) === e7.revenue, `3.2 soma do gráfico de vendas = vendas da BD (${e7.revenue})`);
  const dayRows = sql(`select to_char(d,'YYYY-MM-DD')||'='||coalesce((select sum(total) from orders o where (o.status='done' or o.payment_id is not null) and not o.is_test and o.created_at >= d and o.created_at < d + interval '1 day'),0) from generate_series(timestamptz '${addDays(T, -6)} 00:00:00+00', timestamptz '${addDays(T, 0)} 00:00:00+00', interval '1 day') d order by d`).split('\n').map((x) => Number(x.split('=')[1]));
  check(JSON.stringify(rowsTxt.map((r) => num(r[1]))) === JSON.stringify(dayRows), `3.3 cada dia do gráfico = soma da BD desse dia`);
  await ap.locator('[data-testid="chart-orders"] button:has-text("Ver tabela")').click();
  const ordRows = await ap.locator('[data-testid="chart-orders"] tbody tr').evaluateAll((trs) => trs.map((r) => r.querySelectorAll('td')[1].innerText));
  check(ordRows.reduce((s, r) => s + num(r), 0) === e7.orders, `3.4 soma do gráfico de pedidos = pedidos da BD (${e7.orders})`);
  const hrs = await ap.locator('ol[aria-label="Pedidos por hora"] button').evaluateAll((bs) => bs.map((x) => Number((x.getAttribute('aria-label').match(/: (\d+)/) ?? [])[1])));
  check(hrs.length === 24 && hrs.reduce((s, x) => s + x, 0) === e7.orders, `3.5 pedidos por hora somam os pedidos da BD (${hrs.reduce((s, x) => s + x, 0)} = ${e7.orders})`);
  await ap.locator('[data-testid="chart-sales"] [role=img]').first().focus().catch(() => {});
  await ap.locator('[data-testid="chart-sales"] button:has-text("Ver gráfico")').click();
  const chart = ap.locator('[data-testid="chart-sales"] [role=img]'); const box = await chart.boundingBox();
  await ap.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await sleep(200);
  check(await ap.locator('[data-testid="chart-sales"] [role=status]').isVisible(), '3.6 dica (tooltip) ao passar o rato no gráfico');
  await chart.focus(); await ap.keyboard.press('ArrowLeft'); await sleep(150);
  check(await ap.locator('[data-testid="chart-sales"] [role=status]').isVisible(), '3.7 dica também por teclado (setas)');
  check(await ap.locator('[data-testid="chart-sales"] ul[aria-label="Legenda"]').isVisible(), '3.8 legenda com 2 séries (atual e período anterior)');
  await ap.screenshot({ path: `${OUT}/dashboard-desktop.png`, fullPage: true });

  // ---------- 4. tempo real ----------
  await ap.goto(B + '/admin/dashboard?r=hoje', { waitUntil: 'networkidle' }); await ap.waitForSelector('[data-testid="live-pending"]');
  await sleep(1500);
  const livePend = num(await ap.locator('[data-testid="live-pending"]').innerText()); const liveProg = num(await ap.locator('[data-testid="live-preparing"]').innerText());
  check(livePend === Number(sql("select count(*) from orders where status='pending'")), `4.1 "Agora": pendentes ${livePend} = BD`);
  check(liveProg === Number(sql("select count(*) from orders where status='preparing'")), `4.2 "Agora": em preparação ${liveProg} = BD`);
  check(num(await ap.locator('[data-testid="live-tables"]').innerText()) === Number(sql("select count(distinct table_id) from orders where status<>'done'")), '4.3 "Agora": mesas ativas = BD');
  // pedido à espera há 15 min
  const t1 = sql("select id from dining_tables where number=4");
  sql(`insert into orders (table_id,total,is_test,idempotency_key,status,created_at) values (${t1},1000,true,'late-test-key-padpadpad','pending', now() - interval '15 minutes')`);
  await ap.waitForSelector('[data-testid="live-late"]', { timeout: 15000 }); check(true, '4.4 pedido pendente há 15 min aparece em "A precisar de atenção"');
  sql("delete from orders where idempotency_key='late-test-key-padpadpad'");
  // novo pedido real (produto não-demo) por um cliente + concluído -> vendas de hoje sobem sem recarregar
  await ap.evaluate(() => { window.__m = 'sem-reload'; });
  const before = Number(await ap.locator('[data-testid="hero-revenue"]').getAttribute('data-raw'));
  const tok = sql("select qr_token from dining_tables where number=7");
  const cctx = await b.newContext(devices['iPhone 13']); const c = await cctx.newPage();
  await c.goto(`${B}/m/${tok}`, { waitUntil: 'networkidle' });
  await c.getByRole('button', { name: 'Adicionar Seed Espetada' }).click(); await c.getByRole('button', { name: /Ver pedido/ }).click();
  await c.getByRole('button', { name: /Confirmar e enviar pedido/ }).click(); await c.waitForURL(/\/pedido\//);
  const inprogBefore = num(await ap.locator('[data-testid="hero-inprogress"]').innerText());
  await ap.waitForFunction((n) => parseInt(document.querySelector('[data-testid="live-pending"]').innerText) >= n, livePend + 1, { timeout: 12000 });
  check(true, '4.5 novo pedido do cliente aparece em "Agora" em tempo real');
  const bell = await ap.locator('[data-testid="bell-count"]').innerText().then((t) => Number(t)).catch(() => 0);
  check(bell >= 1, `4.6 sino de notificações com ${bell} por ver`);
  const oid = sql("select id from orders where table_id=" + sql("select id from dining_tables where number=7") + " and idempotency_key not like 'seed-%' order by created_at desc limit 1");
  sql(`update orders set status='done' where id='${oid}'`);
  await ap.waitForFunction((v) => Number(document.querySelector('[data-testid="hero-revenue"]').getAttribute('data-raw')) > v, before, { timeout: 15000 });
  const after = Number(await ap.locator('[data-testid="hero-revenue"]').getAttribute('data-raw'));
  check(after - before === 5500, `4.7 pedido concluído: vendas de hoje subiram exatamente ${after - before} FCFA (5500) sem recarregar`);
  check(await ap.evaluate(() => window.__m) === 'sem-reload', '4.8 atualização sem recarregar a página');
  await ap.locator('[data-testid="bell"]').click(); check(await ap.locator('[data-testid="bell-panel"]').isVisible(), '4.9 sino abre a lista de notificações');
  await ap.keyboard.press('Escape'); await sleep(200);
  check(!(await ap.locator('[data-testid="bell-count"]').count()) || (await ap.locator('[data-testid="bell-count"]').innerText()) !== String(bell), '4.10 ao abrir, as notificações novas ficam lidas');

  // ---------- 5. relatórios e CSV ----------
  await ap.goto(B + '/admin/relatorios?r=30d', { waitUntil: 'networkidle' });
  const e30 = expected(addDays(T, -29), addDays(T, 1), false);
  const tot = async (id, col) => num(await ap.locator(`[data-testid="${id}"] tfoot td[data-total="${col}"]`).innerText());
  check(await tot('rep-days', 'Vendas (FCFA)') === e30.revenue, `5.1 relatório por dia: total de vendas = BD (${e30.revenue})`);
  check(await tot('rep-days', 'Pedidos') === e30.orders, `5.2 relatório por dia: total de pedidos = BD (${e30.orders})`);
  check(await tot('rep-products', 'Vendas (FCFA)') === e30.revenue, '5.3 relatório de produtos soma as mesmas vendas');
  check(await tot('rep-categories', 'Vendas (FCFA)') === e30.revenue, '5.4 relatório de categorias soma as mesmas vendas');
  check(await tot('rep-tables', 'Vendas (FCFA)') === e30.revenue && await tot('rep-tables', 'Pedidos') === e30.orders, '5.5 relatório por mesa soma as mesmas vendas e pedidos');
  const csvOf = async (tipo, ctx = actx) => { const r = await ctx.request.get(`${B}/admin/relatorios/csv?tipo=${tipo}&r=30d`); return { status: r.status(), type: r.headers()['content-type'], disp: r.headers()['content-disposition'], body: await r.text() }; };
  const cd = await csvOf('dias');
  const lines = cd.body.replace('﻿', '').trim().split('\r\n'); const hdr = lines[0].split(';');
  check(cd.status === 200 && /text\/csv/.test(cd.type) && /attachment/.test(cd.disp) && cd.body.startsWith('﻿'), '5.6 CSV por dia: ficheiro com BOM e cabeçalhos de descarga');
  check(lines.slice(1).reduce((s, l) => s + Number(l.split(';')[hdr.indexOf('Vendas (FCFA)')]), 0) === e30.revenue, '5.7 soma do CSV por dia = vendas da BD');
  const co = await csvOf('pedidos');
  const cp = await csvOf('produtos');
  check(cp.body.includes("'=SUM(1+1)"), '5.8 CSV neutraliza fórmulas: produto "=SUM(1+1)" sai como texto (prefixo \')');
  check(!/(^|;)=HYPERLINK/m.test(co.body.replace(/'=HYPERLINK/g, '')), '5.9 nenhuma célula do CSV começa por "="');
  check((await csvOf('xyz')).status === 400, '5.10 tipo de CSV inválido -> 400');
  const anon = await b.newContext(); check((await anon.request.get(`${B}/admin/relatorios/csv?tipo=dias`)).status() === 401, '5.11 CSV sem sessão -> 401');
  await ap.screenshot({ path: `${OUT}/relatorios.png` });

  // ---------- 6. permissões do Gerente ----------
  const gctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const gp = await login(gctx, G1, G1PASS);
  check(await gp.locator('[data-testid="hero-revenue"]').isVisible(), '6.1 Gerente vê a visão geral');
  await gp.goto(B + '/admin/relatorios', { waitUntil: 'networkidle' }); check(await gp.locator('[data-testid="rep-days"]').isVisible(), '6.2 Gerente vê relatórios');
  check((await csvOf('dias', gctx)).status === 200, '6.3 Gerente exporta CSV');
  await gp.goto(B + '/admin/atividade'); await gp.waitForURL('**/admin/dashboard', { timeout: 8000 }).catch(() => {});
  check(/dashboard/.test(gp.url()), '6.4 Atividade é só para Admin (Gerente reencaminhado)');
  check(!(await gp.locator('aside >> text=Atividade').count()) && !(await gp.locator('aside >> text=Utilizadores').count()), '6.5 menu do Gerente sem Utilizadores nem Atividade');
  await ap.goto(B + '/admin/atividade', { waitUntil: 'networkidle' }); check((await ap.locator('[data-testid="activity"] tbody tr').count()) > 5 && await ap.locator('text=Pedido atualizado').first().isVisible(), '6.6 Admin vê o registo de atividade');

  // ---------- 7. categorias e fotografias ----------
  await ap.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  const catForm = ap.locator('form:has(button:has-text("Adicionar categoria"))');
  await catForm.locator('input[name=label]').fill('Categoria Teste'); await catForm.locator('input[name=description]').fill('Só para testar');
  await catForm.getByRole('button', { name: 'Adicionar categoria' }).click(); await ap.waitForSelector('[data-testid="cat-categoria-teste"]');
  check(sql("select count(*) from menu_categories where id='categoria-teste'") === '1', '7.1 categoria criada');
  const pos = () => sql("select string_agg(id, ',' order by position, id) from menu_categories");
  const p0 = pos(); await ap.getByRole('button', { name: 'Subir Categoria Teste' }).click(); await sleep(1500);
  const p1 = pos(); check(p1 !== p0 && p1.split(',').indexOf('categoria-teste') === p0.split(',').indexOf('categoria-teste') - 1, `7.2 categoria sobe uma posição`);
  await ap.getByRole('button', { name: 'Descer Categoria Teste' }).click(); await sleep(1500); check(pos() === p0, '7.3 categoria desce (volta à posição inicial)');
  await ap.locator('[data-testid="cat-categoria-teste"] input[id^="cl-"]').fill('Categoria Renomeada'); await ap.locator('[data-testid="cat-categoria-teste"]').getByRole('button', { name: 'Guardar' }).click(); await sleep(1200);
  check(sql("select label from menu_categories where id='categoria-teste'") === 'Categoria Renomeada', '7.4 categoria renomeada');
  // produto na nova categoria -> aparece no menu do cliente; esconder -> desaparece
  sql("insert into menu_items (category_id,name,description,price,position) values ('categoria-teste','Item da categoria teste','x',1500,99)");
  const tok1 = sql('select qr_token from dining_tables where number=1');
  await c.goto(`${B}/m/${tok1}`, { waitUntil: 'networkidle' }); check(await c.locator('h2:has-text("Categoria Renomeada")').isVisible(), '7.5 categoria nova aparece no menu do cliente');
  await ap.locator('[data-testid="cat-categoria-teste"] input[type=checkbox]').uncheck(); await sleep(1200);
  await c.goto(`${B}/m/${tok1}`, { waitUntil: 'networkidle' }); check((await c.locator('h2:has-text("Categoria Renomeada")').count()) === 0, '7.6 categoria escondida some do menu do cliente');
  await ap.locator('[data-testid="cat-categoria-teste"]').getByRole('button', { name: 'Eliminar' }).count().then((n) => check(n === 0, '7.7 categoria com produtos não tem botão eliminar'));
  sql("delete from menu_items where name='Item da categoria teste'"); await ap.reload({ waitUntil: 'networkidle' });
  ap.once('dialog', (d) => d.accept()); await ap.locator('[data-testid="cat-categoria-teste"]').getByRole('button', { name: 'Eliminar' }).click(); await sleep(1500);
  check(sql("select count(*) from menu_categories where id='categoria-teste'") === '0', '7.8 categoria vazia eliminada');
  // fotografia: carregar e remover
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const li = ap.locator('li', { hasText: 'Seed Gelado' }).first(); await li.getByRole('button', { name: 'Editar' }).click();
  await li.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png }); await li.getByRole('button', { name: 'Guardar alterações' }).click(); await sleep(2000);
  check(sql("select (image is not null)::text from menu_items where name='Seed Gelado'") === 'true', '7.9 fotografia carregada para a base de dados');
  const img = await actx.request.get(`${B}/api/menu-image/${sql("select id from menu_items where name='Seed Gelado'")}`); check(img.status() === 200 && /image\//.test(img.headers()['content-type']), '7.10 fotografia servida ao cliente');
  await ap.reload({ waitUntil: 'networkidle' }); ap.once('dialog', (d) => d.accept());
  await ap.locator('li', { hasText: 'Seed Gelado' }).first().getByRole('button', { name: 'Remover foto' }).click(); await sleep(1500);
  check(sql("select (image is null)::text from menu_items where name='Seed Gelado'") === 'true', '7.11 fotografia removida');

  // ---------- 8. telemóvel ----------
  const mctx = await b.newContext(devices['Pixel 7']); const mp = await login(mctx, ADMIN, PASS);
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth); check(ov <= 0, `8.1 visão geral em Android sem scroll horizontal (${ov})`);
  await mp.locator('header [data-testid="menu-button"]').click();
  await mp.locator('#painel-menu [data-testid="nav-relatorios"]').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  check(await mp.locator('#painel-menu nav[aria-label="Painel"] a').count() >= 15 && await mp.locator('#painel-menu [data-testid="nav-relatorios"]').isVisible(), '8.2 navegação no telemóvel: menu lateral com todas as opções');
  await mp.keyboard.press('Escape');
  await mp.screenshot({ path: `${OUT}/dashboard-android.png`, fullPage: true });
  const ip = await b.newContext(devices['iPhone 13']); const ipp = await login(ip, ADMIN, PASS);
  check((await ipp.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '8.3 visão geral em iPhone sem scroll horizontal');

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.map((x) => '  ✓ ' + x).join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.map((x) => '  ✗ ' + x).join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + [...new Set(errs)].map((x) => '  ! ' + x).join('\n'));
})().catch((e) => { console.error('FATAL', e.stack.split('\n').slice(0, 7).join('\n')); console.log('ok até agora:', ok.length, 'falhas:', bad); process.exit(1); });
