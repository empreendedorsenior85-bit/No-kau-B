/**
 * Impressora térmica VIRTUAL ESC/POS (para testes): servidor TCP como uma impressora de rede (porta RAW).
 *  - interpreta os comandos ESC/POS recebidos (ESC @, ESC t, ESC a, ESC E, GS !, GS V, LF, DLE EOT) — comando desconhecido = erro;
 *  - descodifica o texto com a tabela anunciada (PC860 / PC850);
 *  - responde aos pedidos de estado DLE EOT 2 / 4 (papel, tampa), como as impressoras reais;
 *  - cada ligação com dados de impressão = 1 "impressão" (talões separados pelo corte GS V).
 */
const net = require('node:net');
const CP860 = { 0x80: 'Ç', 0x81: 'ü', 0x82: 'é', 0x83: 'â', 0x84: 'ã', 0x85: 'à', 0x86: 'Á', 0x87: 'ç', 0x88: 'ê', 0x89: 'Ê', 0x8a: 'è', 0x8b: 'Í', 0x8c: 'Ô', 0x8d: 'ì', 0x8e: 'Ã', 0x8f: 'Â', 0x90: 'É', 0x91: 'À', 0x92: 'È', 0x93: 'ô', 0x94: 'õ', 0x95: 'ò', 0x96: 'Ú', 0x97: 'ù', 0x98: 'Ì', 0x99: 'Õ', 0x9a: 'Ü', 0x9d: 'Ù', 0x9f: 'Ó', 0xa0: 'á', 0xa1: 'í', 0xa2: 'ó', 0xa3: 'ú', 0xa4: 'ñ', 0xa5: 'Ñ', 0xa6: 'ª', 0xa7: 'º', 0xfa: '·', 0xf8: '°' };
const CP850 = { 0x80: 'Ç', 0x82: 'é', 0x83: 'â', 0x85: 'à', 0x87: 'ç', 0x88: 'ê', 0x93: 'ô', 0xa0: 'á', 0xa1: 'í', 0xa2: 'ó', 0xa3: 'ú', 0xb5: 'Á', 0xb6: 'Â', 0xc6: 'ã', 0xc7: 'Ã', 0xd2: 'Ê', 0xd6: 'Í', 0xe0: 'Ó', 0xe2: 'Ô', 0xe4: 'õ', 0xe5: 'Õ', 0xe9: 'Ú', 0xfa: '·', 0xf8: '°' };

function decode(buf) {
  const out = { tickets: [], errors: [], codepage: null, statusQueries: 0 };
  let cur = { lines: [], line: '', cut: false, bold: false, sizes: [], align: [] };
  let table = {};
  const flushLine = () => { cur.lines.push(cur.line); cur.line = ''; };
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x1b) {
      const c = buf[++i];
      if (c === 0x40) { /* init */ }
      else if (c === 0x74) { const n = buf[++i]; out.codepage = n; table = n === 3 ? CP860 : n === 2 ? CP850 : {}; }
      else if (c === 0x61) cur.align.push(buf[++i]);
      else if (c === 0x45) cur.bold = !!buf[++i];
      else if (c === 0x4d) { cur.font = buf[++i]; out.fonts = [...new Set([...(out.fonts || []), cur.font])]; } // ESC M n — fonte A (0) / B (1)
      else out.errors.push(`ESC 0x${(c ?? 0).toString(16)} desconhecido`);
    } else if (b === 0x1d) {
      const c = buf[++i];
      if (c === 0x21) cur.sizes.push(buf[++i]);
      else if (c === 0x76 && buf[i + 1] === 0x30) { // GS v 0 m xL xH yL yH dados — imagem (logótipo, QR)
        const bpr = buf[i + 3] | (buf[i + 4] << 8), h = buf[i + 5] | (buf[i + 6] << 8);
        cur.images = [...(cur.images || []), { width: bpr * 8, height: h, bytes: bpr * h, data: Buffer.from(buf.subarray(i + 7, i + 7 + bpr * h)), black: [...buf.subarray(i + 7, i + 7 + bpr * h)].reduce((n, x) => n + (x.toString(2).split('1').length - 1), 0) }];
        i += 6 + bpr * h;
      }
      else if (c === 0x56) { const m = buf[++i]; if (m === 65 || m === 66) i++; cur.cut = true; if (cur.line) flushLine(); out.tickets.push(cur); cur = { lines: [], line: '', cut: false, bold: false, sizes: [], align: [] }; }
      else out.errors.push(`GS 0x${(c ?? 0).toString(16)} desconhecido`);
    } else if (b === 0x10 && buf[i + 1] === 0x04) { i += 2; out.statusQueries++; }
    else if (b === 0x0a) flushLine();
    else if (b >= 0x20 && b < 0x7f) cur.line += String.fromCharCode(b);
    else if (b >= 0x80) cur.line += table[b] ?? `\\x${b.toString(16)}`;
    else out.errors.push(`byte de controlo 0x${b.toString(16)}`);
  }
  if (cur.lines.length || cur.line) { if (cur.line) flushLine(); out.tickets.push(cur); }
  return out;
}

/** Arranca uma impressora virtual. status: { paperOut, coverOpen, respondsToStatus } (pode mudar durante o teste). */
function startFakePrinter(port, opts = {}) {
  const state = { paperOut: false, coverOpen: false, respondsToStatus: true, ...opts };
  const jobs = []; // cada ligação com dados de impressão
  const server = net.createServer((sock) => {
    const chunks = [];
    sock.on('data', (d) => {
      chunks.push(d);
      // responde aos pedidos de estado como uma impressora real (1 byte por pergunta)
      for (let i = 0; i + 2 < d.length + 1; i++) {
        if (d[i] === 0x10 && d[i + 1] === 0x04 && state.respondsToStatus) {
          const n = d[i + 2];
          let v = 0x12; // bits fixos 1 e 4 (formato Epson)
          if (n === 2) { if (state.coverOpen) v |= 0x04; if (state.paperOut) v |= 0x20; }
          if (n === 4) { if (state.paperOut) v |= 0x60; }
          sock.write(Buffer.from([v]));
        }
      }
    });
    sock.on('close', () => {
      const all = Buffer.concat(chunks);
      const onlyStatus = all.length > 0 && all.length % 3 === 0 && [...Array(all.length / 3).keys()].every((k) => all[k * 3] === 0x10 && all[k * 3 + 1] === 0x04);
      if (all.length && !onlyStatus) jobs.push({ at: Date.now(), bytes: all, ...decode(all) });
    });
    sock.on('end', () => sock.end());
    sock.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, state, jobs, close: () => new Promise((r) => server.close(r)) })));
}

module.exports = { startFakePrinter, decode };
