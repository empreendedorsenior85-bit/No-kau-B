/* Fotos ilustrativas (IA): etiqueta no menu do cliente, aviso no admin, reimportação, e foto real substitui a ilustrativa. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const S = __dirname;
const B = 'http://localhost:3100';
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres -d nokau_test -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);

(async () => {
  // Etapa C: para pedir é preciso conta — todos os contextos destes testes são de um cliente com sessão iniciada
  const b = require('./auth-helper.js').clientContexts(await chromium.launch());
  const tok = sql("select qr_token from dining_tables where number = 1");

  // 1. menu do cliente (telemóvel)
  const cx = await b.newContext({ ...devices['iPhone 13'] });
  const c = await cx.newPage();
  c.on('pageerror', (e) => errs.push(e.message));
  c.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });
  await c.goto(`${B}/m/${tok}`, { waitUntil: 'networkidle' });
  const labels = await c.locator('[data-testid="illustrative"]').count();
  check(labels === 7, `1.1 7 produtos com etiqueta "Imagem ilustrativa" (${labels})`);
  const img = c.locator('img[alt="Frango Churrasco"]');
  check(await img.count() === 1, '1.2 foto do Frango Churrasco presente');
  await img.scrollIntoViewIfNeeded(); await c.waitForTimeout(500);
  const loaded = await img.evaluate((e) => e.complete && e.naturalWidth);
  check(loaded >= 640 && loaded <= 1200, `1.3 imagem carregada (largura ${loaded} px; otimizada para telemóvel)`);
  const lbl = await c.locator('li:has(img[alt="Frango Churrasco"]) [data-testid="illustrative"]').innerText();
  check(/imagem ilustrativa/i.test(lbl), `1.4 etiqueta no Frango Churrasco (${lbl})`);
  const noImg = await c.locator('li:has-text("Moelas") img').count();
  check(noImg === 0, '1.5 produto sem foto continua sem foto (Moelas)');
  await c.locator('li:has(img[alt="Camarão Tigre / Gambas"])').screenshot({ path: `${S}/shot-cliente-camarao.png` });
  // pedido continua a funcionar com produto com foto
  await c.getByRole('button', { name: 'Adicionar Frango Churrasco' }).click();
  await c.getByRole('button', { name: /Ver pedido/ }).click();
  await c.getByRole('button', { name: /Confirmar e enviar pedido/ }).click();
  await c.waitForURL(/\/pedido\//, { timeout: 30000 });
  check(true, '1.6 pedido com produto com foto enviado');

  // 2. admin
  const ax = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ax.newPage();
  a.on('pageerror', (e) => errs.push(e.message));
  await a.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  await a.fill('input[name=email]', 'gerente@nokau.test'); await a.fill('input[name=password]', 'senha-forte-123'); await a.click('button[type=submit]');
  await a.waitForURL('**/admin/dashboard');
  await a.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  const notes = await a.locator('text=Foto ilustrativa (IA)').count();
  check(notes === 7, `2.1 admin assinala 7 fotos ilustrativas (${notes})`);

  // 3. reimportação liga foto a produto existente sem foto; não mexe noutros
  check(await a.locator('[data-testid="import-panel"]').count() === 0, '3.0 ementa completa e fotos ligadas: painel de importação escondido');
  sql("update menu_items set image_path = null where name = 'Bife Nô Kau'");
  await a.reload({ waitUntil: 'networkidle' });
  const pend = await a.locator('[data-testid="photos-pending"]').innerText().catch(() => '');
  check(/^1 produto pode receber/.test(pend), `3.0b ementa completa mas 1 foto por ligar: painel aparece (${pend})`);
  a.once('dialog', (d) => d.accept());
  await a.getByRole('button', { name: 'Importar ementa original' }).click();
  await a.waitForSelector('text=Ementa importada', { timeout: 30000 });
  const msg = await a.locator('text=Ementa importada').first().innerText();
  check(/1 fotografias ligadas/.test(msg), `3.1 reimportação liga 1 fotografia (${msg})`);
  check(sql("select image_path from menu_items where name='Bife Nô Kau'") === '/menu/ilustrativas/bife-nokau.webp', '3.2 Bife Nô Kau voltou a ter a foto');
  check(sql("select count(*) from menu_items where image_path is not null") === '7', '3.3 continuam 7 fotos ligadas (sem duplicar)');

  // 4. foto real enviada pelo admin substitui a ilustrativa
  await a.reload({ waitUntil: 'networkidle' });
  const li = a.locator('li').filter({ hasText: 'Salada Noçoise' }).filter({ has: a.locator('input[type=checkbox]') }).first();
  await li.getByRole('button', { name: 'Editar' }).click();
  await li.locator('input[type=file]').setInputFiles(`${S}/hf/salada-nicoise.png`);
  await li.getByRole('button', { name: 'Guardar alterações' }).click();
  for (let i = 0; i < 40 && sql("select coalesce(image_path,'null') from menu_items where name='Salada Noçoise'") !== 'null'; i++) await a.waitForTimeout(500);
  const row = sql("select coalesce(image_path,'null')||'|'||(image is not null) from menu_items where name='Salada Noçoise'");
  check(row === 'null|true', `4.1 upload real: image_path limpo e foto guardada (${row})`);
  await c.goto(`${B}/m/${tok}`, { waitUntil: 'networkidle' });
  const src = await c.locator('img[alt="Salada Noçoise"]').getAttribute('src');
  check(/^\/api\/menu-image\//.test(src), `4.2 cliente vê a foto real (${src})`);
  check(await c.locator('li:has(img[alt="Salada Noçoise"]) [data-testid="illustrative"]').count() === 0, '4.3 foto real sem etiqueta ilustrativa');
  // reimportar NÃO volta a pôr a ilustrativa por cima da real
  await a.goto(B + '/admin/menu', { waitUntil: 'networkidle' });
  check(await a.locator('[data-testid="import-panel"]').count() === 0, '4.3b produto com foto real não conta como "foto por ligar"');
  sql("delete from menu_items where name = 'Moelas'"); // força o painel (falta 1 produto)
  await a.reload({ waitUntil: 'networkidle' });
  a.once('dialog', (d) => d.accept());
  await a.getByRole('button', { name: 'Importar ementa original' }).click();
  await a.waitForSelector('text=Ementa importada', { timeout: 30000 });
  check(sql("select coalesce(image_path,'null') from menu_items where name='Salada Noçoise'") === 'null', '4.4 reimportação não substitui a foto real');

  // repor estado
  sql("update menu_items set image = null, image_type = null where name='Salada Noçoise'");
  sql("update menu_items set image_path = '/menu/ilustrativas/salada-nicoise.webp' where name='Salada Noçoise'");

  await b.close();
  console.log(`OK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.join('\n'));
})().catch((e) => { console.log('FATAL', e.message.slice(0, 600)); console.log('ok até agora:', ok.length, 'falhas:', bad); process.exit(1); });
