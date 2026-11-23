# Nô Kau — Guia de entrega (HANDOVER)

Este documento explica, em linguagem simples, tudo o que o dono do restaurante (ou quem tomar conta do site) precisa de saber para continuar o projeto **sem partir nada**.

> Última revisão: 23/11/2026 · Versão em produção: `e776a55` (ramo `main`)

---

## 1. O que é o sistema

O Nô Kau é um só sistema com cinco partes:

| Parte | Endereço | Para quem |
|---|---|---|
| **Site público** (início, menu, cultura, eventos, reservas, contacto) | https://nokaubissau.com | Todos |
| **Menu da mesa (QR Code)** — o cliente lê o QR da mesa, pede, chama o empregado, pede a conta | `https://nokaubissau.com/m/<código-da-mesa>` | Clientes no restaurante |
| **Área do cliente** — resumo, reservas, pagamentos e recibos, pedidos | https://nokaubissau.com/cliente | Clientes com conta |
| **Painel da equipa** — pedidos, mesas, reservas, pagamentos, estoque, relatórios, impressoras, utilizadores | https://nokaubissau.com/admin | Administrador, Gerente, Garçom |
| **Servidor local (opcional)** — um computador no restaurante que continua a funcionar sem internet e imprime os talões | `http://<ip-do-computador>:3000` | Equipa, dentro do restaurante |

O endereço antigo **https://nokau.vercel.app continua a funcionar e NÃO deve ser removido**: os QR Codes que já estão impressos nas mesas apontam para ele.

### Perfis e o que cada um pode fazer

| Perfil | Pode |
|---|---|
| **Administrador** | Tudo: incluindo utilizadores, atividade (registo de ações) e configuração de recibos |
| **Gerente** | Operação e gestão: pedidos, mesas, reservas, pagamentos, estoque, menu, relatórios, impressoras, QR Codes, garçons |
| **Garçom** | Só Pedidos, Mesas e a própria conta |
| **Cliente** | Só os seus pedidos, reservas, pagamentos e recibos |

As permissões são verificadas **no servidor** (não apenas escondendo botões).

---

## 2. Contas e acessos (quem é dono de quê)

> ⚠️ Neste momento **todas as contas estão em nome do programador**. Antes da entrega, devem passar para o dono (ver secção 9).

| Serviço | O que guarda | Conta atual | O que fazer |
|---|---|---|---|
| **GitHub** — `empreendedorsenior85-bit/no-kau-b` | Todo o código | Programador · **repositório PÚBLICO** | Tornar **privado** e transferir para a conta do dono |
| **Vercel** — equipa `empreendedorsenior85-7220`, projeto `nokau` | O site publicado, as variáveis secretas e o domínio | Programador · **sem verificação em 2 passos (2FA)** | Ativar 2FA; transferir o projeto e o domínio para a equipa do dono |
| **Neon** (via Vercel) | A base de dados (todos os pedidos, pagamentos, clientes, reservas, estoque) | Ligada ao projeto Vercel | Garantir que o dono tem acesso e é o titular |
| **Domínio** `nokaubissau.com` | O endereço do site | Comprado na Vercel em 23/11/2026, válido até **23/11/2027** · renovação **$12.03/ano** | Confirmar que a **renovação automática** está ligada; mover para a equipa Vercel do dono (`vercel domains move`) |

Nunca partilhe senhas por WhatsApp/email. Convide as pessoas para as contas (GitHub, Vercel) com o email delas.

---

## 3. Variáveis de ambiente (configuração secreta)

Ficam na **Vercel → projeto `nokau` → Settings → Environment Variables**. Não estão no código (de propósito).

### Site online (Vercel — Produção)

| Variável | Obrigatória | Para quê | Cuidado |
|---|---|---|---|
| `DATABASE_URL` | **Sim** | Ligação à base de dados Neon. Também é usada durante a publicação. | Criada pela integração Neon — não alterar à mão |
| `SESSION_SECRET` | **Sim** | Segredo das sessões (32+ caracteres) | **Se mudar, toda a gente é desligada** (equipa e clientes) |
| `NEXT_PUBLIC_SITE_URL` | **Sim** | Endereço oficial: `https://nokaubissau.com` (QR Codes novos, partilhas no WhatsApp, Google) | Depois de mudar, é preciso **publicar de novo** |
| `SETUP_TOKEN` | Só no início | Código para criar o primeiro administrador | Já não é preciso — pode ser apagado |
| `NOKAU_SYNC_TOKEN` | Só com servidor local | Senha partilhada entre o site e o computador do restaurante | **Ainda não está configurada** (o servidor local ainda não foi instalado) |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | Não | Mapa na página de contacto | — |

As outras variáveis `PG*`, `POSTGRES_*`, `NEON_*` foram criadas automaticamente pela integração Neon. Não mexer.

### Servidor local do restaurante (computador no restaurante)

Ver `docs/servidor-local.md`. Resumo: `DATABASE_URL` (base de dados **local**), `SESSION_SECRET`, `NOKAU_ROLE=local`, `NOKAU_CENTRAL_URL=https://nokau.vercel.app`, `NOKAU_SYNC_TOKEN` (o **mesmo** valor que está na Vercel).

---

## 4. Como publicar uma alteração

1. Fazer a alteração num ramo (ex.: `revisao-producao`), **nunca diretamente no `main`**.
2. Verificar que tudo compila: `npx tsc --noEmit`, `npx eslint src`, `npm run build`.
3. Correr os testes (ver secção 7).
4. Juntar ao `main`: `git checkout main && git merge --ff-only revisao-producao && git push origin main`.
5. Publicar: `vercel deploy --prod --yes` (ou, se a Vercel estiver ligada ao GitHub, a publicação começa sozinha ao enviar para o `main` — confirmar em Vercel → Settings → Git).
6. Confirmar: abrir `https://nokaubissau.com/api/health` → tem de mostrar `"ok":true` e a versão nova; ver erros em Vercel → Logs.

**Voltar atrás** se algo correr mal: Vercel → Deployments → escolher a publicação anterior → **Promote to Production**. Leva segundos e não apaga dados.

### Trabalhar no código no próprio computador

```bash
npm install
# criar o ficheiro .env.local com DATABASE_URL (de uma base de dados de TESTE, nunca a de produção) e SESSION_SECRET
npm run dev
```
Node.js 22 ou mais recente.

---

## 5. Regras para não estragar nada

1. **Nunca apagar pagamentos nem movimentos de estoque.** A base de dados recusa (de propósito). Um pagamento errado **anula-se com motivo** no painel (Pagamentos → Anular).
2. **A base de dados atualiza-se sozinha** quando sai uma versão nova (as mudanças são feitas pelo próprio site, de forma segura e repetível). Não correr comandos SQL à mão em produção.
3. **Não remover o endereço `nokau.vercel.app`** — QR Codes impressos dependem dele.
4. **Não mudar o `SESSION_SECRET`** sem avisar a equipa (todos têm de voltar a entrar).
5. **Métodos de pagamento** estão num só sítio: `src/lib/types.ts` (`PAYMENT_METHODS`). Hoje: Orange Money, Telecel, Pagamento à mão (dinheiro). Os antigos (MTN MoMo, cartão, transferência) ficam só no histórico.
6. **Vendas** = pedidos **concluídos ou pagos** (regra usada no painel, relatórios, PDF e CSV — `src/lib/stats.ts`).
7. **Estoque**: as vendas descontam sozinhas quando o pedido fica **Concluído** (feito pela base de dados). Não descontar à mão no código.
8. **Testar sempre antes de publicar** (secção 7) e publicar de preferência fora das horas de serviço.

---

## 6. Onde está cada coisa no código

| Pasta / ficheiro | O que é |
|---|---|
| `src/app/(site)/` | Páginas públicas do site |
| `src/app/m/` | Menu da mesa (QR) |
| `src/app/cliente/` | Área do cliente (login, registo, resumo, reservas, pagamentos, pedidos, recibos) |
| `src/app/admin/(panel)/` | Painel da equipa (uma pasta por opção do menu) |
| `src/app/admin/actions.ts`, `stock-actions.ts` | Todas as ações do painel (cada uma verifica o perfil) |
| `src/app/api/` | Rotas internas (pedidos, chamadas, tempo real, sincronização, estado `/api/health`) |
| `src/db/schema.ts`, `src/db/init.ts` | Estrutura da base de dados e atualizações automáticas |
| `src/lib/` | Regras do negócio (pedidos, pagamentos, estoque, reservas, relatórios, sessões, impressão) |
| `src/components/` | Peças visuais |
| `docs/` | Documentação técnica: produção, servidor local, impressão, pedidos por QR, recibos |

Documentação mais detalhada: `docs/producao.md` (monitorização, recuperação), `docs/servidor-local.md` (instalar o computador do restaurante), `docs/impressao.md` (impressoras). Para a equipa, há um **tutorial da impressora dentro do painel** (Ajuda → Ligar impressora).

---

## 7. Testes

O projeto foi verificado com cerca de **1 790 verificações automáticas** (28 conjuntos: pedidos, pagamentos, recibos, estoque, reservas, área do cliente, navegação em 8 tamanhos de ecrã, servidor local, impressão, etc.), todas a passar na versão `e776a55`.

Os testes estão em **`tests/e2e/`** e correm-se com **`npm run test:e2e`** (≈ 1 hora). Como preparar o computador (PostgreSQL de teste, navegador) e o que cada conjunto verifica: **`tests/e2e/README.md`**.

> Os testes usam **bases de dados de TESTE** locais. Nunca os apontar para a base de dados de produção.

---

## 8. Custos mensais (estimativa — confirmar nos painéis)

| Serviço | Custo | Notas |
|---|---|---|
| Domínio `nokaubissau.com` | **$12.03 / ano** | Renovação em 23/11/2027 |
| Vercel (alojamento do site) | Plano **Hobby: grátis**, mas **só para uso pessoal/não comercial**. Para um negócio, o plano adequado é o **Pro** (preço por membro da equipa — ver vercel.com/pricing) | **Confirmar o plano atual** em Vercel → Settings → Billing |
| Neon (base de dados) | Depende do plano (há plano grátis com limites) | Confirmar em Neon → Billing. O painel aberto em "tempo real" mantém a base de dados ativa e gasta horas de computação |
| Servidor local (opcional) | Computador + eletricidade no restaurante | Só se for instalado |
| Impressoras térmicas, rolos de papel | Compra única + consumíveis | — |

---

## 9. O que falta fazer (lista da auditoria)

### Antes de entregar
1. **Passar as contas para o dono**: repositório GitHub (e torná-lo **privado**), projeto e domínio Vercel, base de dados Neon.
2. **Ativar a verificação em 2 passos (2FA)** na Vercel e no GitHub.
3. **Confirmar o plano Vercel** (Hobby não é para uso comercial).
4. **Cópias de segurança**: confirmar no Neon quantos dias de "recuperação no tempo" o plano inclui e fazer também uma cópia semanal (`pg_dump`) guardada fora da Neon.
5. ~~Guardar os testes no repositório~~ ✅ feito (`tests/e2e/`). Falta substituir o `README.md` (ainda é o texto genérico do Next.js) por um resumo deste guia.
6. **Contas da equipa**: o dono cria o seu próprio administrador; a conta do programador é **desativada** (Utilizadores → Desativar).
7. **Revisão dos dados**: confirmar que não ficaram produtos de demonstração no menu nem contas de teste.
8. Confirmar que a **renovação automática** do domínio está ligada.

### Pode esperar (melhorias)
- Ligar um alerta gratuito (UptimeRobot / Better Stack) a `https://nokaubissau.com/api/health`.
- Instalar o servidor local e configurar `NOKAU_SYNC_TOKEN` (quando houver impressoras).
- Reduzir o custo do "tempo real" do painel (consulta a base de dados a cada 1,5 s por cada painel aberto).
- Apagar o ficheiro antigo `nokau-site.zip` e os ramos antigos do GitHub já integrados.
- Renomear a página "Personalização de Ingressos" para "Personalização de Recibos".
- Atualizações pequenas de bibliotecas (React 19.3.1, Tailwind 4.3.5) — com testes.
- Comprar e ligar o `nokau.gw` (através da ARN / nic.gw — a Vercel não vende `.gw`).

---

## 10. Em caso de problema

| Sintoma | Primeiro passo |
|---|---|
| Site não abre | Ver `https://nokaubissau.com/api/health` e Vercel → Logs; se a última publicação causou o problema: **Promote** da anterior |
| "Pagamentos recebidos" a 0 | Os pedidos fechados em "Concluído" sem pagamento aparecem em **Por cobrar** na Visão geral — registar com **Receber pagamento** |
| Produto desapareceu do menu | Ver Estoque: pode estar **esgotado automaticamente** (stock a zero) — uma entrada repõe |
| Talões não saem | Tutorial no painel: Ajuda → Ligar impressora (secção "Problemas comuns") |
| Toda a equipa foi desligada | Alguém mudou o `SESSION_SECRET` — entrar de novo |
