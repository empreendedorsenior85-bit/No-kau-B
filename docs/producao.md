# Produção — funcionamento contínuo, monitorização e recuperação

## Variáveis obrigatórias (Vercel → Settings → Environment Variables)

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Base de dados (Neon). Tem de existir **também durante a build**. |
| `SESSION_SECRET` | Segredo das sessões, com 32 caracteres ou mais. Se mudar, todas as sessões terminam. |
| `SETUP_TOKEN` | Só para o primeiro acesso. Pode ser removido depois. |
| `NOKAU_SYNC_TOKEN` | **Necessário se existir servidor local no restaurante.** Sem ele, nada do restaurante chega ao painel online: pedidos, pagamentos, chamadas e reservas feitos lá ficam só lá. Verificação em 17/11/2026: **não está configurado** (`/api/sync/orders` responde 404). |

## Monitorização

- **Estado do serviço:** `GET /api/health`.
  - Responde `200 {"ok":true,"db":"ok",...}` quando está tudo bem.
  - Responde `503` quando a base de dados não responde.
  - Não revela dados nem configuração.
- **Recomendado:** um monitor gratuito (UptimeRobot ou Better Stack) a chamar `https://<site>/api/health` a cada 5 minutos, com alerta por email ou SMS.
- **Servidor local:** o mesmo endereço, `http://<ip-do-servidor>:3000/api/health`, pode ser vigiado a partir da rede do restaurante.

## Registos (logs)

- **Formato:** os erros do servidor são escritos como **uma linha JSON por evento**, por exemplo:
  ```json
  {"t":"…","level":"error","event":"order.save_failed","node":"central","code":"…","error":"…"}
  ```
- **Onde vê-los:**
  - na Vercel: Deployments → Logs (filtrar por `"level":"error"`);
  - no servidor local: na saída do processo (`pm2 logs`).
- **Nunca são registados:** palavras-passe, tokens, cookies ou dados pessoais completos.

**Eventos principais:**

| Área | Eventos |
|---|---|
| Pedidos | `order.save_failed`, `order.status_failed` |
| Reservas e chamadas | `reserva.save_failed`, `call.create_failed` |
| Base de dados e menu | `db.transient_retry`, `db.idle_client_error`, `menu.db_unavailable` |
| Sincronização | `sync.*_rejected` |
| Impressão | `print.loop_failed` |
| Saúde | `health.db_failed` |

## Recuperação de falhas, já implementada

- **Base de dados a "acordar" (Neon):** as consultas repetem-se automaticamente em erros transitórios. O cliente vê "Tentar novamente", nunca detalhes técnicos.
- **Pedidos do cliente sem rede:**
  - ficam no telemóvel e são enviados quando a rede volta;
  - cada pedido tem uma chave única, por isso reenviar nunca o duplica.
- **Pagamentos:** cada pedido só pode ser pago uma vez (bloqueio na base de dados), e um pagamento nunca se apaga, só se anula, com motivo.
- **Impressão:** fila com repetição automática. Um envio interrompido nunca é reenviado sozinho.
- **Erros inesperados numa página:** aparece uma página "Algo correu mal" com o botão "Tentar novamente". No painel, o menu lateral continua disponível.

## Cópias de segurança (backups)

- **Neon (central):** a recuperação para um momento anterior depende do plano.
  - Confirme no painel da Neon, em Settings → Storage, o período de retenção (*history retention*).
  - Para um negócio com pagamentos, recomendo **pelo menos 7 dias**.
- **Exportação diária independente (recomendado):**
  ```
  pg_dump "$DATABASE_URL" --format=custom --file=nokau-$(date +%F).dump
  ```
  Corra-a a partir do servidor local ou de outro computador, agendada com `cron` ou o Agendador de Tarefas. Guarde 30 dias.
- **Servidor local:** o mesmo `pg_dump` sobre a base `nokau_local`. Os dados do restaurante também ficam no central quando a sincronização está ativa.
- **Repor uma cópia:**
  ```
  pg_restore --clean --no-owner -d "$DATABASE_URL" nokau-AAAA-MM-DD.dump
  ```
  Teste primeiro numa base de dados vazia.

## Segurança

- **Sessões:**
  - ficam guardadas no servidor; o cookie tem um segredo aleatório e a base de dados guarda só o seu hash;
  - "Terminar sessão" invalida a sessão de imediato, mesmo que o cookie tenha sido copiado;
  - mudar ou redefinir a palavra-passe, ou desativar a conta, termina as outras sessões.
- **Tentativas de login:**
  - 5 falhas por IP+conta, ou 20 por conta vindas de qualquer IP, bloqueiam o login durante 15 minutos;
  - o limite fica guardado na base de dados, por isso vale para todas as instâncias da Vercel e sobrevive a reinícios;
  - a tabela guarda só hashes, nunca emails nem IPs.
- **Cabeçalhos:**
  - o painel não pode ser embutido noutro site (`frame-ancestors 'none'`, `X-Frame-Options: DENY`);
  - `nosniff`, `Referrer-Policy` e `Permissions-Policy` estão ativos;
  - o HSTS é aplicado pela Vercel.
- **Fotos dos produtos:** são validadas e convertidas no servidor para WebP (até 800 px), sem metadados como GPS ou modelo do telemóvel.
