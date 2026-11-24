# Nô Kau — Restaurante Grill · Bar & Karaoke (Bissau)

Site e sistema de gestão do restaurante **Nô Kau**, em Bissau, Guiné-Bissau.

- **Site:** https://nokaubissau.com (o endereço antigo `https://nokau.vercel.app` continua ativo — os QR Codes já impressos usam-no)
- **Painel da equipa:** https://nokaubissau.com/admin
- **Estado do serviço:** https://nokaubissau.com/api/health

> 📘 **Vai tomar conta do projeto?** Comece pelo **[HANDOVER.md](HANDOVER.md)**: contas e acessos, configuração, como publicar, custos, cópias de segurança e as regras para não estragar nada.

## O que o sistema faz

| Parte | Para quê |
|---|---|
| **Site público** | Apresentação, menu, cultura, eventos, reservas de mesa, contacto e redes sociais |
| **Menu da mesa (QR Code)** | O cliente lê o QR da mesa, faz o pedido, chama o empregado ou o gerente e pede a conta |
| **Área do cliente** | Resumo, reservas, pagamentos e recibos, histórico de pedidos |
| **Painel da equipa** | Pedidos e mesas em tempo real, reservas, pagamentos (Orange Money, Telecel, pagamento à mão), estoque, menu, relatórios (PDF e Excel), impressoras, QR Codes, utilizadores |
| **Servidor local (opcional)** | Um computador no restaurante que continua a funcionar sem internet e imprime os talões na cozinha e no balcão |

Perfis: **Administrador**, **Gerente**, **Garçom** e **Cliente** — cada um só vê e altera o que lhe cabe (verificado no servidor).

## Tecnologia

- [Next.js](https://nextjs.org) 16 (App Router) + React 19 + Tailwind CSS 4, em TypeScript
- Base de dados **PostgreSQL** ([Neon](https://neon.tech)), ligada pela integração da Vercel
- Alojamento na **[Vercel](https://vercel.com)** · domínio `nokaubissau.com` (registado na Vercel)
- Impressoras térmicas ESC/POS (rede, USB ou Bluetooth) através do servidor local

> ⚠️ Esta versão do Next.js tem mudanças em relação a versões antigas. Antes de alterar código, ver a documentação incluída em `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## Começar (no seu computador)

Precisa de **Node.js 22** ou mais recente.

```bash
npm install
```

Crie o ficheiro `.env.local` (não vai para o Git):

```bash
DATABASE_URL=postgres://…   # uma base de dados de TESTE — nunca a de produção
SESSION_SECRET=…            # 32 caracteres ou mais
SETUP_TOKEN=…               # código para criar o primeiro administrador (só numa base nova)
```

```bash
npm run dev     # abre em http://localhost:3000
```

Numa base de dados nova, a estrutura é criada sozinha no primeiro acesso. Para criar o primeiro administrador, abra `/admin` e use o `SETUP_TOKEN`.

Lista completa das variáveis (incluindo as do servidor local): **[HANDOVER.md → secção 3](HANDOVER.md#3-variáveis-de-ambiente-configuração-secreta)**.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Site em modo de desenvolvimento |
| `npm run build` | Prepara a versão final (precisa de `DATABASE_URL`) |
| `npm run start` | Corre a versão final |
| `npm run lint` | Verifica o código |
| `npm run test:e2e` | Testes automáticos completos (≈ 1 750 verificações, ≈ 1 hora) — ver [tests/e2e/README.md](tests/e2e/README.md) |

## Publicar

Resumo (passos completos e como voltar atrás em [HANDOVER.md → secção 4](HANDOVER.md#4-como-publicar-uma-alteração)):

1. Alterar num ramo próprio, nunca diretamente no `main`.
2. `npx tsc --noEmit`, `npm run lint`, `npm run build` e os testes — tudo sem erros.
3. Juntar ao `main` e publicar: `vercel deploy --prod --yes`.
4. Confirmar em https://nokaubissau.com/api/health a versão nova e ver os registos na Vercel.

## Documentação

| Documento | Conteúdo |
|---|---|
| [HANDOVER.md](HANDOVER.md) | Guia de entrega: tudo o que o dono precisa de saber |
| [docs/producao.md](docs/producao.md) | Produção: variáveis, monitorização, registos, recuperação |
| [docs/servidor-local.md](docs/servidor-local.md) | Instalar o computador do restaurante (funciona sem internet) |
| [docs/impressao.md](docs/impressao.md) | Impressoras: modelos, ligação, fila, problemas |
| [docs/pedidos-qr.md](docs/pedidos-qr.md) | Pedidos pelo QR Code, chamadas e pagamentos |
| [docs/recibos.md](docs/recibos.md) | Recibos e personalização |
| [tests/e2e/README.md](tests/e2e/README.md) | Testes automáticos: preparar e correr |

Para a equipa do restaurante há também um **tutorial da impressora dentro do painel** (Ajuda → Ligar impressora).
