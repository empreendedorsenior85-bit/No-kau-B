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
| **Gerente** | Acompanhar e atualizar pedidos, consultar mesas, consultar/descarregar/imprimir QR Codes e gerir o menu. Não altera mesas, QR Codes nem utilizadores. |

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
