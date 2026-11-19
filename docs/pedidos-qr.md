# Pedidos por QR Code — configuração e operação

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | O que é |
|---|---|
| `DATABASE_URL` | String de ligação PostgreSQL. Em Supabase: *Project Settings → Database → Connection pooling* (modo *Transaction*). |
| `SESSION_SECRET` | Texto aleatório com 32+ caracteres (assina a sessão do gerente). |
| `SETUP_TOKEN` | Código de uso único para o primeiro acesso (`/admin/setup`). |
| `NEXT_PUBLIC_SITE_URL` | (Opcional) Domínio definitivo, ex.: `https://nokau.com`. Define o endereço dentro dos QR Codes. |
| `NOKAU_SYNC_TOKEN` | (Opcional) Segredo partilhado com o servidor local do restaurante (32+ caracteres). Sem ele, a sincronização está desligada. Ver `docs/servidor-local.md`. |

Todas são **apenas do servidor** (exceto `NEXT_PUBLIC_SITE_URL`, que é público por natureza). Nunca vão para o navegador.

## Perfis

| Perfil | Pode |
|---|---|
| **Admin** | Tudo: pedidos, mesas e QR Codes (adicionar, renomear, desativar, gerar novo), menu, utilizadores (criar, perfil, ativar/desativar, redefinir palavra-passe). |
| **Gerente** | Acompanhar e atualizar pedidos, painel de mesas e chamadas, consultar/descarregar/imprimir QR Codes, gerir o menu, **gerir garçons** (criar, desativar, redefinir palavra-passe, atribuir mesas) e ver o histórico de **Atendimento**. Não altera mesas, QR Codes nem utilizadores. |
| **Garçom** | Só atendimento: painel de **Mesas** (chamadas dos clientes, “A caminho”, “Resolvido”), **Pedidos** (mudar o estado) e a própria conta. Não vê faturação, menu, relatórios, QR Codes, garçons nem utilizadores — no servidor, não só no menu. Entra direto no painel de mesas. |

Quem faz o primeiro acesso fica como Admin. O sistema nunca deixa de ter um Admin ativo. Cada pessoa pode mudar a própria palavra-passe em `/admin/conta`.

## Primeiro acesso
1. Abrir `/admin/setup`, introduzir o `SETUP_TOKEN`, o email e a palavra-passe (mín. 10 caracteres) do gerente.
2. Isto cria as tabelas, as categorias, **10 mesas** e a conta do gerente. Só funciona uma vez.
3. Em `/admin/menu`: adicionar os pratos reais (nome, preço em FCFA, fotografia, disponibilidade).
4. Em `/admin/qr`: descarregar/imprimir os QR Codes (`Folha para imprimir` → imprimir ou *Guardar como PDF*).

## Segurança — o que está garantido
- O QR contém um token aleatório de 128 bits (não o número da mesa). Se um QR for copiado: **Gerar novo QR** (o antigo deixa de funcionar).
- Preços, disponibilidade e total são lidos da base de dados no servidor; o navegador só envia ids e quantidades.
- Cada pedido tem uma chave única: duplo toque ou reenvio nunca cria dois pedidos.
- Limite de 10 pedidos por mesa em 10 minutos.
- Estados só mudam por ações do gerente autenticado (verificadas no servidor).
- Todas as mudanças de estado ficam em `audit_log`.

## Tempo real
O painel usa Server-Sent Events (`/api/admin/stream`) e, se o canal falhar, consulta o servidor de 5 em 5 segundos. Ao reconectar, recupera todos os pedidos em falta.

## Notificações com o ecrã bloqueado
Não incluídas. O alerta sonoro/vibração só funciona com o painel aberto e depois de tocar em **Ativar alertas**.

## Painel de gestão (Dashboard)

Entrada: `/admin` → **Visão geral** (`/admin/dashboard`). Menu lateral: Visão geral · Pedidos · Mesas · Menu · Relatórios · QR Codes · Utilizadores e Atividade (só Admin) · A minha conta.

**Definições usadas em todos os números** (iguais no painel, nos relatórios e nos CSV):
- *Pedidos*: todos os criados no período. *Vendas*: soma do total dos pedidos **concluídos**. *Ticket médio*: vendas ÷ pedidos concluídos. *Unidades*: quantidades dos pedidos concluídos.
- Pedidos feitos com produtos de **demonstração** ficam de fora, salvo se marcar "Incluir pedidos de teste".
- Fuso horário: Africa/Bissau. Período anterior = mesma duração imediatamente antes.

**Relatórios** (`/admin/relatorios`): por dia, produtos, categorias e mesas, com totais, e exportação CSV (abre no Excel). Texto que comece por `=`, `+`, `-` ou `@` sai com prefixo `'` para não ser executado como fórmula.

**Categorias e fotografias** (`/admin/menu`): criar, renomear, reordenar, esconder e eliminar categorias vazias; carregar e remover a fotografia de cada produto.

**Notificações**: sino com pedidos novos e pedidos à espera há mais de 10 minutos; alerta sonoro (botão "Ativar alertas"). Só com o painel aberto.

## Ementa original (importação)

`src/content/nokau-menu.ts` contém a ementa completa do Nô Kau transcrita das três ementas do restaurante: 19 categorias e 171 produtos, com os preços originais em FCFA.

- **Admin → Menu → "Importar ementa original"**: cria o que falta, sem duplicados; nunca sobrescreve um preço já editado; remove os produtos de demonstração e esconde as categorias antigas vazias.
- Produtos com dois preços na ementa (Bolha/Garrafa, Média/Grande, tamanhos) são dois produtos, para se poderem pedir.
- Itens repetidos entre ementas foram unidos (Coca-Cola, Compal, Sumo Natural, Maaza/Sumol/Fanta, Sopa, Água pequena, Água 1,5 L).
- 24 produtos ficam marcados **"A confirmar"** (gralhas corrigidas, nomes ou preços ambíguos). A nota desaparece ao guardar o produto.
- Fotografias: por ficheiro (`public/menu/…`, campo `image` no catálogo) ou carregadas no painel.

## Fiabilidade do envio de pedidos

- O cliente envia o pedido por `POST /api/pedidos` (endereço estável entre publicações; as ações de servidor mudam de identificador a cada publicação e falhavam em páginas abertas antes de uma atualização). A ação antiga mantém-se para páginas já abertas.
- Envio com tempo limite (20 s) e até 4 tentativas automáticas com a **mesma chave**: o servidor devolve sempre o mesmo pedido, nunca cria dois. Se tudo falhar, o carrinho fica guardado e o botão volta a ficar ativo.
- Base de dados: erros transitórios (ligação cortada, base a "acordar") são repetidos automaticamente; uma ligação partida é destruída e nunca devolvida ao pool. Arranque a frio sem DDL (migração só se faltar).
- Limites: 20 pedidos por mesa em 10 minutos; 1000 pedidos por IP em 10 minutos (abuso em massa).
- Telemóveis: o Next 16 suporta Chrome 111+, Safari 16.4+, Firefox 111+. Navegadores mais antigos podem não carregar o menu.

## Sem internet

O menu da mesa funciona sem internet depois da primeira visita, e os pedidos feitos sem rede ficam guardados no telemóvel e seguem sozinhos quando a ligação volta (sem duplicados). Para o restaurante continuar a trabalhar com a internet em baixo existe o **servidor local** — instalação, sincronização, regras e limitações em [`docs/servidor-local.md`](servidor-local.md).

## Atendimento (Etapa 3)

- **No menu da mesa** o cliente tem “Precisa de ajuda?”: **Chamar empregado**, **Pedir a conta** (mostra o total estimado dos pedidos da mesa desde a última conta entregue) e **Chamar gerente**. Vê o estado: “o restaurante foi avisado” → “a caminho” → “resolvido”, e pode cancelar enquanto ninguém respondeu.
- Uma só chamada ativa por tipo e por mesa (tocar outra vez não duplica); máximo de 12 chamadas por mesa em 10 minutos.
- **Sem internet** a chamada não fica em fila (chegaria tarde e enganaria o cliente): aparece “faça sinal a um empregado”. Com o servidor local instalado, as chamadas feitas na rede do restaurante funcionam sem internet.
- **Painel de Mesas** (toda a equipa): mesas a chamar em destaque com o tempo de espera, lista “Clientes a chamar” com **A caminho** / **Resolvido**, garçom de cada mesa, pedidos e histórico. Alertas com som, vibração e título a piscar enquanto houver clientes à espera.
- **Garçons** (`/admin/garcons`): cada mesa pode ter um garçom. As chamadas dessa mesa tocam no garçom dela; mesas sem garçom avisam toda a equipa; “Chamar gerente” toca só na gestão. Desativar um garçom termina a sessão dele e retira-o das mesas.
- **Atendimento** (`/admin/atendimento`): número de chamadas, tempo médio de resposta (até “A caminho”), % respondidas em ≤ 2 min, por pessoa, por mesa e histórico detalhado.
- As chamadas, os garçons e as atribuições sincronizam com o servidor local (atualize primeiro o site central e só depois o servidor local).

## Clientes e pagamentos (Etapa 4)

- **Conta do cliente** (`/cliente`): registo único com nome, email, telefone e palavra-passe (guardada com scrypt). Entra com email **ou** telefone. Os pedidos feitos no menu da mesa ficam no histórico do cliente (“Os meus pedidos”), com o estado e se já estão **pagos**. A sessão do cliente é separada da equipa e nunca dá acesso ao painel.
- **Conta obrigatória para pedir (Etapa C)**:
  - Sem sessão, o carrinho mostra **“Entrar ou criar conta para enviar”**, com os formulários dentro do próprio carrinho. Depois o cliente volta ao carrinho, com os mesmos produtos.
  - O servidor recusa pedidos sem sessão (`401`).
  - A **equipa com sessão** (garçom ou gerente) pode registar pedidos em nome da mesa.
  - **Sessão terminada (ex.: mudou a palavra-passe):**
    - antes de enviar, o carrinho pede para entrar de novo;
    - um pedido já guardado no telemóvel sem rede fica à espera (“entre na sua conta”) e segue sozinho depois do login.
- **Contas no servidor do restaurante**:
  - As contas são copiadas do site para o servidor local: nome, email, telefone e o **hash** da palavra-passe, nunca a palavra-passe. Assim o cliente entra e pede no Wi-Fi do restaurante mesmo sem internet.
  - As contas criadas no restaurante seguem para o site.
  - **Se a mesma pessoa se registar nos dois lados sem internet** (mesmo email ou telefone), fica a conta do site e os pedidos passam para ela. A fusão fica na Atividade (`sync.customer_alias` / `sync.customer_merge`).
  - O servidor local passa assim a guardar dados pessoais dos clientes. Deve estar num computador do restaurante com acesso restrito e cópias de segurança.
- **Pagamento em mão, no restaurante**: em **Mesas → escolher a mesa → Conta**, o gerente vê os pedidos por pagar, escolhe o método (Numerário com troco, Orange Money, MTN MoMo, Cartão/TPA, Transferência) e confirma. Fica registado: valor (calculado pelo servidor), método, data e hora, quem recebeu, valor entregue/troco e nota. O pedido de conta da mesa fica resolvido.
- **Quem pode**: só **Admin e Gerente** confirmam e anulam. O Garçom vê a conta mas não confirma.
- **Proteção**: um pedido nunca é pago duas vezes (mesmo com dois gerentes ao mesmo tempo). Um pagamento **não se altera nem se apaga** — garantido pela própria base de dados — só se **anula**, com motivo, e fica na Atividade. Os pedidos de um pagamento anulado voltam a ficar por pagar.
- **Páginas**: **Pagamentos** (total recebido e por método, lista, anulação) e **Clientes** (contas, pedidos, pago/por pagar).
- **Servidor local**: os pagamentos sincronizam nos dois sentidos. Se o mesmo pedido for cobrado no local e no central enquanto não havia internet, o segundo é recusado e aparece na Atividade (“sync.payment_conflict”) para o gerente resolver (devolver o dinheiro / anular um deles).

## WhatsApp

Botão flutuante no site público (abre o WhatsApp do restaurante com uma mensagem pronta). O número está em `src/lib/site.ts` (`whatsappE164`). **Confirmar que o número tem WhatsApp**; para esconder o botão, pôr `null`.

## Reservas

- **Cliente** (`/reservas`): nome, telefone, email, data, hora, número de pessoas e observações. O pedido é **guardado** e fica **Pendente**; o cliente é levado para a página da reserva (`/reserva/<link secreto>`), que fica guardada no telemóvel. Pode cancelar enquanto estiver pendente.
- **Painel** (`/admin/reservas`, Admin e Gerente): as reservas novas aparecem **sozinhas e com alerta** (som, contador no menu, campainha) em todos os painéis abertos. **Aprovar** ou **Rejeitar**, com mensagem opcional ao cliente. Se duas pessoas decidirem ao mesmo tempo, vale só a primeira (a outra vê quem decidiu).
- **Aviso ao cliente**: quando a reserva é aprovada ou rejeitada, o cliente vê um aviso **em qualquer página do site** (com data, hora, pessoas, código e a mensagem do restaurante); a página da reserva aberta atualiza-se sozinha. Clientes com conta veem também em “As minhas reservas”.
- **Histórico** no fundo da página de reservas: filtros por datas, estado e pesquisa (nome, telefone, email, código). Cada passo fica na Atividade.
- **Proteção**: o link do cliente não mostra telefone/email nem dados internos; o Garçom não vê reservas (dados pessoais); máximo de 5 pedidos pendentes por email/telefone.
- **Servidor local**: as reservas feitas no site chegam ao restaurante; decisões tomadas no restaurante (mesmo sem internet) chegam ao site quando a ligação volta.
- O cliente é avisado **no site** (não por SMS/email: falta um serviço de envio).
