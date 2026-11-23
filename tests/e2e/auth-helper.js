/* Testes: sessão de um cliente de teste (conta obrigatória para pedir — Etapa C).
   Cria a conta "cliente.teste@nokau.test" (se faltar) e uma sessão no servidor, como faria o login. */
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const SERVERS = {
  'http://localhost:3100': { db: 'nokau_test', secret: 'test-secret-test-secret-test-secret-123456' },
  'http://localhost:3200': { db: 'nokau_local', secret: 'local-secret-local-secret-local-secret-99' },
};
const q = (db, s) => execSync(`psql -h localhost -p 5433 -U postgres -d ${db} -tA -q -v ON_ERROR_STOP=1`, { input: s, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
const ID = '00000000-0000-4000-8000-00000000c11e';
const EMAIL = 'cliente.teste@nokau.test', PHONE = '+245900000001';
const HASH = (() => { const salt = Buffer.alloc(16, 7); return `scrypt$${salt.toString('base64')}$${crypto.scryptSync('cliente-teste-1', salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`; })();

/** Valor do cookie nk_client válido para o servidor `base` (cria conta e sessão se preciso). */
function clientCookieValue(base, opts = {}) {
  const s = SERVERS[base.replace(/\/$/, '')] ?? opts;
  const db = opts.db ?? s.db, secret = opts.secret ?? s.secret;
  q(db, `insert into customers (id, name, email, phone, password_hash) values ('${ID}', 'Cliente Teste', '${EMAIL}', '${PHONE}', '${HASH}')
         on conflict do nothing`);
  const sid = crypto.randomBytes(32).toString('base64url');
  q(db, `insert into auth_sessions (id_hash, kind, subject, expires_at) values ('${crypto.createHash('sha256').update(sid).digest('hex')}', 'client', '${ID}', now() + interval '1 day')`);
  return `${sid}.${crypto.createHmac('sha256', secret).update(`sessao:client:${sid}`).digest('base64url')}`;
}

/** Cabeçalho Cookie para fetch() em node. */
const clientCookie = (base, opts) => `nk_client=${clientCookieValue(base, opts)}`;

/** Põe a sessão do cliente de teste num contexto do Playwright (antes de abrir o menu da mesa). */
async function loginClient(ctx, base, opts) {
  await ctx.addCookies([{ name: 'nk_client', value: clientCookieValue(base, opts), url: base }]);
}

module.exports = { clientCookie, clientCookieValue, loginClient, TEST_CLIENT_ID: ID };

/**
 * Suítes antigas (antes da conta obrigatória): todos os contextos do navegador passam a ser de um cliente com conta.
 * Se a base ainda não existir (início do e2e, antes do primeiro acesso), o contexto fica sem sessão.
 */
function clientContexts(browser, bases = ['http://localhost:3100']) {
  const orig = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const ctx = await orig(...args);
    for (const base of bases) { try { await loginClient(ctx, base); } catch {} }
    return ctx;
  };
  return browser;
}
module.exports.clientContexts = clientContexts;
