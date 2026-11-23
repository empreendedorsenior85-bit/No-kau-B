#!/bin/bash
# Arranca o servidor central (3100) e/ou o local (3200). Uso: servers.sh central|local|both|stop-central|stop-local|stop
S="$(cd "$(dirname "$0")" && pwd)"
TOKEN=sync-token-de-teste-0123456789abcdefghij
cd "$(cd "$S/../.." && pwd)"
start_central() {
  DATABASE_URL=postgres://postgres@localhost:5433/nokau_test SESSION_SECRET=test-secret-test-secret-test-secret-123456 SETUP_TOKEN=setup-test-123 \
  NOKAU_SYNC_TOKEN=$TOKEN nohup npx next start -p 3100 > $S/central.log 2>&1 &
  echo $! > $S/central.pid
}
start_local() {
  DATABASE_URL=postgres://postgres@localhost:5433/nokau_local SESSION_SECRET=local-secret-local-secret-local-secret-99 \
  NOKAU_ROLE=local NOKAU_CENTRAL_URL=http://localhost:3100 NOKAU_SYNC_TOKEN=$TOKEN NOKAU_SYNC_INTERVAL_MS=1500 NOKAU_CATALOG_INTERVAL_MS=4000 NOKAU_PRINT_ALLOW_TMP=1 NOKAU_PRINT_INTERVAL_MS=500 \
  nohup npx next start -p 3200 > $S/local.log 2>&1 &
  echo $! > $S/local.pid
}
stop_port() { pkill -f "next start -p $1"; for p in $(pgrep -f next-server); do if tr '\0' ' ' < /proc/$p/environ 2>/dev/null | grep -q "PORT=$1\b"; then kill $p; fi; done; fuser -k $1/tcp 2>/dev/null; sleep 1; }
wait_port() { for i in $(seq 1 40); do curl -sf -o /dev/null localhost:$1/robots.txt && return 0; sleep 0.5; done; echo "porta $1 não arrancou"; return 1; }
case "$1" in
  central) stop_port 3100; start_central; wait_port 3100 ;;
  local) stop_port 3200; start_local; wait_port 3200 ;;
  both) stop_port 3100; stop_port 3200; start_central; start_local; wait_port 3100; wait_port 3200 ;;
  stop-central) stop_port 3100 ;;
  stop-local) stop_port 3200 ;;
  stop) stop_port 3100; stop_port 3200 ;;
esac
