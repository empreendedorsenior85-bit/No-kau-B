# Funcionamento offline e servidor local do restaurante

O Nô Kau funciona em dois níveis quando a internet falha:

| Situação | O que continua a funcionar |
|---|---|
| **Telemóvel do cliente sem rede** (já tinha aberto o menu) | O menu, os preços e as fotos abrem a partir do telemóvel. O cliente pode pedir; o pedido fica guardado no telemóvel e é enviado sozinho quando a rede volta. |
| **Internet do restaurante em baixo** (com o servidor local instalado) | O painel do gerente/cozinha continua a funcionar na rede Wi-Fi do restaurante. Os empregados registam pedidos no servidor local. Quando a internet volta, tudo é enviado ao site central — sem duplicados. |

---

## 1. No telemóvel do cliente (já ativo no site)

- Na primeira visita ao menu da mesa (QR Code) o site guarda no telemóvel: a página, os scripts, os preços e **todas** as fotos do menu. Aparece “✓ Menu guardado neste telemóvel”.
- Sem rede: o menu abre na mesma, com o aviso “Sem internet”.
- Um pedido é **sempre guardado no telemóvel antes de ser enviado** (IndexedDB). Se não houver rede, fica “⏳ Guardado no telemóvel — será enviado automaticamente” e segue sozinho quando a rede volta — com a página aberta, ao reabrir o menu ou, em Android/Chrome, em segundo plano.
- Cada pedido tem uma chave única: reenviar (várias vezes, de vários sítios) **nunca cria pedidos repetidos**.
- Se, entretanto, um produto deixou de estar disponível, o pedido aparece como “✕ Não foi aceite” com o motivo.
- O valor mostrado é uma estimativa; o restaurante recalcula sempre com os preços atuais.

**Limites (do próprio telemóvel/navegador):**
- Só funciona depois de o menu ter sido aberto **uma vez com rede** nesse telemóvel.
- O envio em segundo plano com a página fechada só existe em Android/Chrome. No iPhone, o pedido segue quando o cliente voltar a abrir o menu.
- Um pedido feito sem rede só chega à cozinha quando o telemóvel tiver rede. Para o restaurante continuar a trabalhar com a internet em baixo é preciso o servidor local (secção 2).

---

## 2. Servidor local (rede Wi-Fi do restaurante)

É o mesmo sistema, a correr num computador do restaurante ligado ao router. Recebe do site central o menu, as mesas (com os mesmos QR Codes) e os utilizadores; troca pedidos com o central sempre que há internet.

```
 telemóveis / tablets da equipa ── Wi-Fi ──► SERVIDOR LOCAL (computador do restaurante)
                                                │  (internet, quando há)
                                                ▼
 clientes com QR Code ── internet ──────────► SITE CENTRAL (nokau.vercel.app)
```

### O que faz
- **Painel completo na rede local**: pedidos em tempo real, mudança de estados, mesas, relatórios — sem internet.
- **Pedidos sem internet**: os empregados abrem o menu da mesa no servidor local (endereço local + `/m/<token da mesa>`, ou pelos QR Codes no painel) e registam o pedido. Numeração própria: **L0001, L0002…** (o central usa #0001…), para os dois nunca colidirem.
- **Sincronização automática a cada 5 s**:
  1. menu, mesas e utilizadores: central → local (a cada minuto);
  2. pedidos novos e mudanças de estado do local → central;
  3. pedidos e mudanças de estado do central → local (os pedidos dos clientes com internet aparecem no painel local).
- **Sem perdas nem duplicados**: cada pedido tem o mesmo id nos dois servidores; reenviar é seguro; o que não foi confirmado pelo central volta a ser enviado.
- **Conflitos**: se o mesmo pedido mudar de estado nos dois lados, vence a alteração **mais recente**.
- **Estado visível** no topo do painel: “Servidor local · sincronizado”, “sem internet · N por enviar”, botão “Sincronizar”, e um aviso grande quando o central não responde. No painel central aparece “Servidor do restaurante ligado”.

### Regras
- **Menu, mesas e utilizadores alteram-se só no site central** (no local essas páginas ficam só de leitura e explicam porquê). Chegam ao local na sincronização seguinte.
- Os QR Codes impressos a partir do servidor local apontam para o site central (é o endereço que funciona em qualquer telemóvel).
- Entra-se no servidor local com o **mesmo email e palavra-passe** do painel central (depois da primeira sincronização).

### Requisitos
- Um computador sempre ligado no restaurante (mini-PC, portátil antigo ou PC; Windows ou Linux), ligado ao router por cabo de preferência, e com uma UPS se possível.
- Node.js 20 ou superior e PostgreSQL 16.
- IP fixo na rede local (reserva DHCP no router), por exemplo `192.168.1.10`.
- Relógio do computador certo (sincronização automática de hora ligada) — conta para resolver conflitos.

### Instalação (resumo)
1. Instalar PostgreSQL e criar uma base vazia: `createdb nokau_local`.
2. Copiar o projeto (GitHub `No-kau-B`) e instalar: `npm ci && npm run build`.
3. Criar um segredo forte (mín. 32 caracteres) e configurar **o mesmo valor** nos dois lados:
   - No **site central** (Vercel → Settings → Environment Variables): `NOKAU_SYNC_TOKEN=<segredo>` e publicar de novo.
   - No **servidor local** (ficheiro `.env.local`):
     ```
     NOKAU_ROLE=local
     NOKAU_CENTRAL_URL=https://nokau.vercel.app
     NOKAU_SYNC_TOKEN=<segredo>
     DATABASE_URL=postgres://utilizador:palavra-passe@localhost:5432/nokau_local
     SESSION_SECRET=<outro segredo longo, só deste servidor>
     ```
4. Arrancar: `npm start -- -p 3000` (e configurar para arrancar com o computador: `pm2` em Linux/Windows, ou Agendador de Tarefas no Windows).
5. Com internet, abrir `http://192.168.1.10:3000/admin` num telemóvel da equipa: após a primeira sincronização (segundos) aparece o login.

Sem `NOKAU_SYNC_TOKEN` no central, as rotas de sincronização não existem (404). O segredo nunca vai para o navegador.

### Limitações conhecidas (para decidir nas próximas etapas)
- O servidor local usa `http` na rede interna (sem certificado). Funciona para o painel e para os pedidos da equipa; a instalação como “app” e o modo offline do telemóvel exigem `https` e só existem no site central.
- Sem internet, a disponibilidade de um prato não pode ser alterada no local (o menu vem do central). Os empregados podem simplesmente não o registar.
- Clientes que nunca abriram o menu e estão sem internet não conseguem pedir pelo QR Code — pedem ao empregado, que regista no servidor local.
