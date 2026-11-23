#!/bin/bash
S="$(cd "$(dirname "$0")" && pwd)"
O="$S"
cd "$(cd "$S/../.." && pwd)"
reset_throttle() { for d in nokau_test nokau_local; do psql -h localhost -p 5433 -U postgres -d $d -qc "delete from auth_throttle" >/dev/null 2>&1; done; }
mkdir -p "$S/nav" "$S/out"
rm -f $S/final.out
$S/servers.sh stop >/dev/null 2>&1
export DATABASE_URL=postgres://postgres@localhost:5433/nokau_test SESSION_SECRET=test-secret-test-secret-test-secret-123456 SETUP_TOKEN=setup-test-123
npx tsc --noEmit > $S/final-tsc.out 2>&1; echo "tsc: $?" > $S/final.out
npx eslint src >> $S/final-lint.out 2>&1; echo "eslint: $?" >> $S/final.out
npm run build > $S/build.log 2>&1; echo "build: $?" >> $S/final.out
grep -E "○ /menu" $S/build.log >> $S/final.out
timeout 600 node $S/upgrade.js > $S/f-upgrade.out 2>&1; echo "upgrade: $(grep -E '^(OK|FALHAS|FATAL)' $S/f-upgrade.out | tr '\n' ' ')" >> $S/final.out
$S/servers.sh central >/dev/null 2>&1
cd $O
for t in e2e orderfix roles dash menuimp photos test3; do
  reset_throttle; timeout 900 node $t.js > $S/f-$t.out 2>&1
  echo "$t: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-$t.out | tr '\n' ' ')" >> $S/final.out
done
cd $S
reset_throttle; timeout 600 node offline.js > $S/f-offline.out 2>&1; echo "offline: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-offline.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 600 node etapa3.js > $S/f-e3.out 2>&1; echo "etapa3: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-e3.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 600 node etapa4.js > $S/f-e4.out 2>&1; echo "etapa4: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-e4.out | tr '\n' ' ')" >> $S/final.out
:  echo "etapa3: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-e3.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node reservas.js > $S/f-res.out 2>&1; echo "reservas: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-res.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 1500 node sync.js > $S/f-sync.out 2>/dev/null; echo "sync: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-sync.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node print.js > $S/f-print.out 2>&1; echo "print: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-print.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node etapaA.js > $S/f-A.out 2>&1; echo "etapaA: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-A.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node etapaB.js > $S/f-B.out 2>&1; echo "etapaB: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-B.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 1500 node etapaC.js > $S/f-C.out 2>&1; echo "etapaC: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-C.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 600 node pdftest.js > $S/f-pdf.out 2>&1; echo "pdf: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-pdf.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 600 node btprint.js > $S/f-bt.out 2>&1; echo "bluetooth: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-bt.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node recibos.js > $S/f-recibos.out 2>&1; echo "recibos: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-recibos.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node auditoria.js > $S/f-auditoria.out 2>&1; echo "auditoria: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-auditoria.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node auditoria2.js > $S/f-auditoria2.out 2>&1; echo "auditoria2: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-auditoria2.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node navegacao.js > $S/f-navegacao.out 2>&1; echo "navegacao: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-navegacao.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node estoque.js > $S/f-estoque.out 2>&1; echo "estoque: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-estoque.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node tutorial.js > $S/f-tutorial.out 2>&1; echo "tutorial: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-tutorial.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node cliente.js > $S/f-cliente.out 2>&1; echo "cliente: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-cliente.out | tr '\n' ' ')" >> $S/final.out
reset_throttle; timeout 900 node metodos.js > $S/f-metodos.out 2>&1; echo "metodos: $(grep -E '^(OK|FALHAS|ERROS DE CONSOLA|FATAL)' $S/f-metodos.out | tr '\n' ' ')" >> $S/final.out
echo FIM >> $S/final.out
