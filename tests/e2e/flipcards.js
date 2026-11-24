/* Cartões dos pratos com frente e verso (rotação 3D): menu público (/menu) e menu da mesa / POS (/m/<token>).
   Rato, toque, teclado, "reduzir movimento", botões de adicionar nos dois lados, altura estável, consola limpa. */
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const B = 'http://localhost:3100';
const OUT = `${__dirname}/out/shots`;
const ok = [], bad = [], errs = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execSync(`psql -h localhost -p 5433 -U postgres nokau_test -tAc "${q}"`).toString().trim();

// ângulo (graus) da rotação Y atual de .flip-inner, lido da matriz 3D calculada pelo navegador
const angle = (card) => card.locator('.flip-inner').evaluate((el) => {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  const m = new DOMMatrix(t);
  return Math.round((Math.atan2(-m.m13, m.m11) * 180) / Math.PI + 360) % 360;
});
const vis = (card, side) => card.locator(`.flip-${side}`).evaluate((el) => getComputedStyle(el).visibility);
const watch = (p, name) => {
  p.on('pageerror', (e) => errs.push(`${name} pageerror: ${e.message.slice(0, 150)}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/401|net::ERR/.test(m.text())) errs.push(`${name} consola: ${m.text().slice(0, 150)}`); });
};

(async () => {
  execSync(`mkdir -p ${OUT}`);
  execSync(`${__dirname}/servers.sh central`, { stdio: 'pipe' });
  const token = sql('select qr_token from dining_tables where active order by number limit 1');
  const b = await chromium.launch();

  // ── 1. Menu público, computador com rato: vira ao passar por cima, volta ao sair ──
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
    const p = await ctx.newPage(); watch(p, 'menu-pc');
    await p.goto(B + '/menu', { waitUntil: 'networkidle' });
    const cards = p.locator('[data-testid^="menu-card-"]');
    check(await cards.count() > 0, `1.1 menu: ${await cards.count()} cartões com verso (pratos com descrição)`);
    const card = cards.first();
    await card.scrollIntoViewIfNeeded(); await sleep(900); // entrada (Reveal) terminada
    const h0 = (await card.boundingBox()).height;
    check(await angle(card) === 0 && await vis(card, 'front') === 'visible' && await vis(card, 'back') === 'hidden', '1.2 começa de frente; verso escondido');
    await p.screenshot({ path: `${OUT}/flip-menu-1-frente.png`, clip: await card.boundingBox() });
    await card.hover({ position: { x: 40, y: 40 } });
    await sleep(200);
    const v1 = [await vis(card, 'front'), await vis(card, 'back')];
    await sleep(60);
    const mid = await angle(card);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await p.screenshot({ path: `${OUT}/flip-menu-2-a-rodar.png`, clip: await card.boundingBox() });
    check(mid > 15 && mid < 175, `1.3 rotação 3D real a meio (ângulo ${mid}°, não é troca de imagem)`);
    await sleep(250); // já passou o meio da volta
    const v2 = [await vis(card, 'front'), await vis(card, 'back')];
    check(v1.join() === 'visible,hidden' && v2.join() === 'hidden,visible', `1.3b só um lado ativo em cada instante (1.ª metade: ${v1}; 2.ª metade: ${v2})`);
    check(ov <= 0, `1.4 sem deslocamento horizontal durante a rotação (${ov}px)`);
    await sleep(700);
    check(await angle(card) === 180 && await vis(card, 'back') === 'visible' && await vis(card, 'front') === 'hidden', '1.5 com o rato por cima: verso visível (180°)');
    const backText = await card.locator('.flip-back').innerText();
    const desc = sql(`select description from menu_items where id = ${(await card.getAttribute('data-testid')).replace('menu-card-', '')}`);
    check(backText.includes(desc.slice(0, 20)), '1.6 verso mostra a descrição do prato');
    check(Math.abs((await card.boundingBox()).height - h0) < 1, '1.7 altura do cartão não muda (sem saltos)');
    await p.screenshot({ path: `${OUT}/flip-menu-3-verso.png`, clip: await card.boundingBox() });
    await p.mouse.move(5, 5); await sleep(900);
    check(await angle(card) === 0 && await vis(card, 'front') === 'visible', '1.8 rato sai: volta à frente');
    // teclado: botão "Detalhes" vira e o foco passa para "Voltar"; "Voltar" regressa e devolve o foco
    const name = (await card.locator('.flip-front h3').innerText()).trim();
    await card.getByRole('button', { name: `Ver detalhes de ${name}` }).focus();
    await p.keyboard.press('Enter'); await sleep(800);
    const f1 = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check(await angle(card) === 180 && f1 === `Voltar à frente de ${name}`, `1.9 teclado: Enter em "Detalhes" vira e o foco vai para "Voltar" (${f1})`);
    await p.keyboard.press('Enter'); await sleep(800);
    const f2 = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check(await angle(card) === 0 && f2 === `Ver detalhes de ${name}`, '1.10 teclado: "Voltar" regressa à frente e devolve o foco');
    // muitos cartões: a página continua leve
    const fps = await p.evaluate(async () => {
      const c = [...document.querySelectorAll('[data-testid^="menu-card-"]')].slice(0, 6);
      c.forEach((e) => e.setAttribute('data-flipped', 'true'));
      let n = 0; const t0 = performance.now();
      await new Promise((r) => { const f = () => { n++; performance.now() - t0 < 700 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); });
      c.forEach((e) => e.setAttribute('data-flipped', 'false'));
      return Math.round((n * 1000) / (performance.now() - t0));
    });
    check(fps >= 30, `1.11 6 cartões a rodar ao mesmo tempo: ${fps} imagens/s`);
    await ctx.close();
  }

  // ── 2. Menu público no telemóvel: toque vira e volta ──
  {
    const ctx = await b.newContext({ ...devices['Pixel 7'] });
    const p = await ctx.newPage(); watch(p, 'menu-tel');
    await p.goto(B + '/menu', { waitUntil: 'networkidle' });
    const card = p.locator('[data-testid^="menu-card-"]').first();
    await card.scrollIntoViewIfNeeded(); await sleep(900);
    await card.locator('.flip-front h3').tap(); await sleep(800);
    check(await angle(card) === 180 && await vis(card, 'back') === 'visible', '2.1 telemóvel: toque no cartão mostra o verso');
    await card.locator('.flip-back p').first().tap(); await sleep(800);
    check(await angle(card) === 0 && await vis(card, 'front') === 'visible', '2.2 telemóvel: novo toque volta à frente');
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 0, `2.3 telemóvel: sem deslocamento horizontal (${ov}px)`);
    await ctx.close();
  }

  // ── 3. Menu da mesa (QR) no telemóvel: adicionar nos dois lados, sem conflito com a rotação ──
  {
    const ctx = await b.newContext({ ...devices['Pixel 7'] });
    const p = await ctx.newPage(); watch(p, 'mesa-tel');
    await p.goto(`${B}/m/${token}`, { waitUntil: 'networkidle' });
    const cards = p.locator('[data-testid^="item-"].flip-card');
    check(await cards.count() > 0, `3.1 menu da mesa: ${await cards.count()} cartões com verso`);
    // primeiro cartão disponível com descrição
    let card = null;
    for (let i = 0; i < await cards.count(); i++) {
      const c = cards.nth(i);
      if (await c.locator('.flip-front').getByRole('button', { name: /^Adicionar / }).count()) { card = c; break; }
    }
    const name = (await card.locator('.flip-front h3').innerText()).trim();
    await card.scrollIntoViewIfNeeded();
    const h0 = (await card.boundingBox()).height;
    check(await p.getByRole('button', { name: `Adicionar ${name}`, exact: true }).count() === 1, '3.2 só o botão do lado visível existe para o leitor de ecrã / toque (1 botão "Adicionar")');
    await p.getByRole('button', { name: `Adicionar ${name}`, exact: true }).tap(); await sleep(500);
    check(await card.getAttribute('data-flipped') === 'false', '3.3 tocar em "Adicionar" não vira o cartão');
    check(/1/.test(await p.getByRole('button', { name: /Ver pedido/ }).innerText()), '3.4 produto entrou no pedido (barra "Ver pedido" com 1)');
    await p.screenshot({ path: `${OUT}/flip-mesa-1-frente.png`, clip: await card.boundingBox() });
    await card.locator('.flip-front h3').tap(); await sleep(800);
    check(await angle(card) === 180 && await vis(card, 'back') === 'visible', '3.5 toque no cartão mostra o verso com a descrição');
    await p.screenshot({ path: `${OUT}/flip-mesa-2-verso.png`, clip: await card.boundingBox() });
    check(await p.getByRole('button', { name: `Mais ${name}` }).count() === 1, '3.6 no verso há 1 controlo de quantidade (o da frente está escondido)');
    await p.getByRole('button', { name: `Mais ${name}` }).tap(); await sleep(400);
    check(await card.locator('.flip-back [aria-live]').innerText() === '2' && await card.getAttribute('data-flipped') === 'true', '3.7 "+" no verso: quantidade 2 e o cartão continua no verso');
    check(Math.abs((await card.boundingBox()).height - h0) < 1, '3.8 altura do cartão não muda');
    await p.getByRole('button', { name: `Voltar à frente de ${name}` }).tap(); await sleep(800);
    check(await angle(card) === 0 && await card.locator('.flip-front [aria-live]').innerText() === '2', '3.9 "Voltar": frente com a quantidade 2 (mesmo carrinho nos dois lados)');
    await p.getByRole('button', { name: /Ver pedido/ }).tap();
    check(await p.getByRole('dialog').getByText(name).count() > 0, '3.10 carrinho abre com o produto');
    await ctx.close();
  }

  // ── 4. Menu da mesa no computador: cliente vira com o rato e adiciona no verso; equipa (POS) não vira com o rato ──
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
    const p = await ctx.newPage(); watch(p, 'mesa-pc');
    await p.goto(`${B}/m/${token}`, { waitUntil: 'networkidle' });
    let card = null;
    const cards = p.locator('[data-testid^="item-"].flip-card');
    for (let i = 0; i < await cards.count(); i++) {
      const c = cards.nth(i);
      if (await c.locator('.flip-back button[aria-label^="Adicionar "]').count()) { card = c; break; } // verso ainda escondido: procura por CSS
    }
    await card.scrollIntoViewIfNeeded();
    await card.hover({ position: { x: 40, y: 40 } }); await sleep(900);
    check(await angle(card) === 180 && await vis(card, 'back') === 'visible', '4.1 cliente no computador: rato por cima vira o cartão');
    await card.locator('.flip-back').getByRole('button', { name: /^Adicionar / }).click(); await sleep(400);
    check(await p.getByRole('button', { name: /Ver pedido/ }).count() === 1 && await angle(card) === 180, '4.2 cliente: "Adicionar" no verso funciona e o cartão continua virado');
    await p.mouse.move(2, 2); await sleep(900);
    check(await angle(card) === 0, '4.3 cliente: rato sai, volta à frente');
    await ctx.close();
    // equipa com sessão = POS
    const sctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
    const sp = await sctx.newPage(); watch(sp, 'pos');
    await sp.goto(B + '/admin/login', { waitUntil: 'networkidle' });
    await sp.fill('input[name=email]', 'gerente@nokau.test'); await sp.fill('input[name=password]', 'senha-forte-123'); await sp.click('button[type=submit]');
    await sp.waitForURL((u) => u.pathname.startsWith("/admin/") && u.pathname !== "/admin/login", { timeout: 20000 });
    await sp.goto(`${B}/m/${token}`, { waitUntil: 'networkidle' });
    const pc = sp.locator('[data-testid^="item-"].flip-card').first();
    await pc.hover(); await sleep(800);
    check(await angle(pc) === 0, '4.4 POS (equipa): passar o rato NÃO vira (o botão "Adicionar" não foge)');
    const btn = pc.locator('.flip-front').getByRole('button', { name: /^Adicionar / });
    if (await btn.count()) {
      await btn.click(); await sleep(400);
      check(await pc.getAttribute('data-flipped') === 'false' && await sp.getByRole('button', { name: /Ver pedido/ }).count() === 1, '4.5 POS: clique em "Adicionar" adiciona sem virar');
    }
    await pc.locator('.flip-front h3').click(); await sleep(800);
    check(await angle(pc) === 180, '4.6 POS: clique no cartão mostra o verso');
    await sctx.close();
  }

  // ── 5. "Reduzir movimento": troca de lado sem animação ──
  {
    const ctx = await b.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce' });
    const p = await ctx.newPage(); watch(p, 'reduzir');
    await p.goto(`${B}/m/${token}`, { waitUntil: 'networkidle' });
    const card = p.locator('[data-testid^="item-"].flip-card').first();
    await card.locator('.flip-front h3').tap(); await sleep(60);
    check(await angle(card) === 180 && await vis(card, 'back') === 'visible', '5.1 reduzir movimento: verso aparece logo, sem rotação animada');
    await ctx.close();
  }

  await b.close();
  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log(`\nERROS DE CONSOLA (${errs.length}):\n` + errs.slice(0, 10).join('\n'));
})().catch((e) => { console.log('FATAL', e.message.split('\n')[0]); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
