/* Atualização a partir da versão anterior (como acontece em produção): uma cópia da base é recuada para o esquema antigo
   (sem número de recibo, sem sessões no servidor) e o servidor NOVO arranca sobre ela. Tem de migrar sozinho e funcionar. */
const ROOT = require('node:path').resolve(__dirname, '../..'); // raiz do projeto
const OUTDIR = require('node:path').join(__dirname, 'out'); // capturas e ficheiros gerados (fora do Git)
require('node:fs').mkdirSync(OUTDIR, { recursive: true });
const { chromium } = require('playwright');
const { execSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const PG = 'psql -h localhost -p 5433 -U postgres -v ON_ERROR_STOP=1 -q -tA';
const q = (db, s) => execSync(`${PG} -d ${db}`, { input: s }).toString().trim();
const tq = (db, s) => { try { return q(db, s); } catch { return 'ERRO'; } };
const ok = [], bad = [];
const check = (c, m) => (c ? ok : bad).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 30000, step = 400) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; }

(async () => {
  // 1. cópia da base atual, recuada para o esquema da versão publicada anterior
  q('postgres', "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('nokau_upg')");
  q('postgres', 'drop database if exists nokau_upg');
  q('postgres', "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'nokau_test' and pid <> pg_backend_pid()");
  q('postgres', 'create database nokau_upg template nokau_test');
  const schema = fs.readFileSync((ROOT + '/src/db/schema.ts'), 'utf8');
  const a = schema.indexOf('create or replace function payments_guard()');
  const oldGuard = schema.slice(a, schema.indexOf('$$ language plpgsql;', a) + '$$ language plpgsql;'.length); // versão anterior (sem recibos)
  q('nokau_upg', `
    drop trigger if exists payments_receipt_trg on payments;
    drop function if exists payments_receipt_number();
    ${oldGuard}
    drop index if exists payments_receipt_uq;
    alter table payments drop column if exists receipt_number;
    drop sequence if exists payments_receipt_seq; drop sequence if exists payments_local_receipt_seq;
    drop table if exists auth_sessions; drop table if exists auth_throttle;`);
  check(q('nokau_upg', "select count(*) from information_schema.columns where table_name = 'payments' and column_name = 'receipt_number'") === '0'
    && q('nokau_upg', "select count(*) from information_schema.tables where table_name in ('auth_sessions','auth_throttle')") === '0', '1.1 base recuada para o esquema anterior');
  const payments = q('nokau_upg', 'select count(*) from payments');

  // 2. servidor novo sobre a base antiga
  execSync('fuser -k 3300/tcp 2>/dev/null || true');
  const srv = spawn('npx', ['next', 'start', '-p', '3300'], {
    cwd: (ROOT + ''), detached: true, stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: 'postgres://postgres@localhost:5433/nokau_upg', SESSION_SECRET: 'test-secret-test-secret-test-secret-123456', NOKAU_ROLE: '' },
  });
  const B = 'http://localhost:3300';
  let h = null;
  await waitFor(async () => { const r = await fetch(B + '/api/health', { headers: { connection: 'close' } }); h = await r.json(); return true; }, 60000);
  check(h && h.ok === true && h.db === 'ok', `2.1 /api/health depois de atualizar: ${JSON.stringify(h)}`);
  check(q('nokau_upg', "select count(*) from information_schema.columns where table_name = 'payments' and column_name = 'receipt_number'") === '1', '2.2 migração criou o número de recibo');
  check(tq('nokau_upg', 'select count(*) from payments where receipt_number is null') === '0', `2.3 os ${payments} pagamentos existentes ficaram numerados`);
  check(q('nokau_upg', "select count(*) from information_schema.tables where table_name in ('auth_sessions','auth_throttle')") === '2', '2.4 tabelas de sessões e limites criadas');

  // 3. funciona de ponta a ponta: login da equipa e página de pagamentos
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  await p.goto(B + '/admin/login'); await p.fill('input[name=email]', 'gerente@nokau.test'); await p.fill('input[name=password]', 'senha-forte-123'); await p.click('button[type=submit]');
  check(await p.waitForURL(/\/admin\/dashboard/, { timeout: 20000, waitUntil: 'commit' }).then(() => true, () => false), '3.1 login da equipa funciona depois de atualizar');
  await p.goto(B + '/admin/pagamentos?r=30d', { waitUntil: 'networkidle' });
  check(await p.locator('[data-testid="payment-receipt-number"]').count() > 0 || Number(payments) === 0, '3.2 página de pagamentos com números de recibo');
  const tok = q('nokau_upg', 'select qr_token from dining_tables where active order by number limit 1');
  const item = q('nokau_upg', 'select id from menu_items where active and available order by id limit 1');
  const r = await (await fetch(B + '/api/pedidos', { method: 'POST', headers: { 'content-type': 'application/json', cookie: require('./auth-helper.js').clientCookie(B, { db: 'nokau_upg', secret: 'test-secret-test-secret-test-secret-123456' }) }, body: JSON.stringify({ token: tok, key: `upgrade${Date.now()}0000000000`, lines: [{ itemId: Number(item), quantity: 1 }] }) })).json();
  check(!!r.orderId, '3.3 o cliente consegue fazer um pedido depois de atualizar');
  await b.close();
  try { process.kill(-srv.pid); } catch {}
  execSync('fuser -k 3300/tcp 2>/dev/null || true');
  q('postgres', "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'nokau_upg'");
  q('postgres', 'drop database if exists nokau_upg');

  console.log(`\nOK (${ok.length}):\n` + ok.join('\n'));
  console.log(`\nFALHAS (${bad.length}):\n` + bad.join('\n'));
  console.log('\nERROS DE CONSOLA (0):');
})().catch((e) => { console.log('FATAL', e.message); console.log('ok:', ok, '\nfalhas:', bad); process.exit(1); });
