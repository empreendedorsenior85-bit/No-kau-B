# Testes automáticos (ponta a ponta)

Estes testes abrem o site num **navegador real** (Chromium), fazem o que uma pessoa faria — pedir à mesa, confirmar pagamentos, reservar, gerir o estoque, imprimir — e confirmam o resultado no ecrã **e** na base de dados.

São cerca de **1 790 verificações** em 28 conjuntos. Na versão `e776a55` passaram todas.

> ⚠️ Usam **bases de dados de TESTE** num PostgreSQL local. **Nunca** apontar para a base de dados de produção (Neon): os testes criam e apagam dados.

## O que é preciso (uma vez)

1. **Node.js 22** e as dependências do site: `npm install` (na raiz do projeto).
2. **PostgreSQL 16** a correr em `localhost:5433`, utilizador `postgres` sem senha (só para testes, na própria máquina). Exemplo em Linux:
   ```bash
   sudo apt-get install -y postgresql-16
   sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D /var/tmp/nokau-pg
   sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/nokau-pg -o "-p 5433 -k /tmp" -l /var/tmp/nokau-pg.log start
   psql -h localhost -p 5433 -U postgres -c "create database nokau_test"
   ```
   (Os testes criam sozinhos o resto: tabelas, dados, e a base `nokau_local` do servidor local.)
3. **Dependências dos testes** e o navegador:
   ```bash
   cd tests/e2e
   npm install
   npx playwright install chromium
   ```
4. Ferramentas usadas por alguns testes: `psql`, `pdftotext`/`pdfimages` (pacote `poppler-utils`) e `python3`.

## Correr tudo

```bash
npm run test:e2e        # na raiz do projeto (≈ 1 hora)
```
O resumo fica em `tests/e2e/final.out` — cada linha tem `OK (n)`, `FALHAS (n)` e `ERROS DE CONSOLA (n)`. Tudo certo = **FALHAS (0)** em todas as linhas.

Os 2 "erros de consola" no conjunto `e2e` são esperados: são pedidos inválidos enviados de propósito para confirmar que o servidor os recusa.

## Correr só um conjunto

```bash
npm run build                      # com DATABASE_URL de teste (ver runall.sh)
tests/e2e/servers.sh central       # site de teste em http://localhost:3100
node tests/e2e/metodos.js          # por exemplo
```
`servers.sh both` arranca também o "servidor local" em `http://localhost:3200`.

## O que cada conjunto verifica

| Ficheiro | O quê |
|---|---|
| `upgrade.js` | Atualização da base de dados de uma versão antiga, sem perder dados |
| `e2e.js`, `orderfix.js`, `test3.js` | Menu QR, carrinho, pedidos, painel em tempo real, vários telemóveis |
| `roles.js` | Permissões: Administrador, Gerente, Garçom |
| `dash.js` | Visão geral, gráficos, relatórios e CSV = valores da base de dados |
| `menuimp.js`, `photos.js` | Gestão do menu e fotografias |
| `offline.js` | Pedidos sem internet (fila no telemóvel) |
| `etapa3.js` | Chamadas (empregado, gerente, conta) e garçons |
| `etapa4.js` | Contas de cliente e pagamentos |
| `reservas.js` | Reservas: pedido, aprovação, acompanhamento |
| `sync.js` | Servidor local ⇄ site online (sincronização) |
| `print.js`, `btprint.js` | Impressão de talões (rede, USB, Bluetooth) com impressoras virtuais |
| `etapaA.js` | Segurança (sessões, limites de tentativas), velocidade, páginas de erro |
| `etapaB.js`, `recibos.js` | Números de recibo, recibos, personalização |
| `etapaC.js` | Conta obrigatória para pedir |
| `pdftest.js` | Relatório em PDF |
| `auditoria.js`, `auditoria2.js` | Vendas pagas, Por cobrar, CSV/PDF, visitante sem senha, botões de chamada |
| `navegacao.js` | Menu lateral em 8 tamanhos de ecrã, todos os perfis |
| `estoque.js` | Estoque: entradas, saídas, venda ao concluir, esgotado automático, alertas |
| `tutorial.js` | Tutorial da impressora (conteúdo igual ao sistema real) |
| `cliente.js` | Área do cliente: cada opção do menu, reservas, pagamentos, privacidade |
| `metodos.js` | Métodos de pagamento: só Orange Money, Telecel e pagamento à mão |

Ficheiros de apoio: `auth-helper.js` (sessão de cliente de teste), `fake-printer.js` / `fake-bt.py` (impressoras virtuais), `servers.sh` (arranca os servidores de teste), `catalog.json` (menu de referência), `runall.sh` (corre tudo).
