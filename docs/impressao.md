# Impressão automática de pedidos (cozinha e balcão)

Quando o gerente **aceita** um pedido (botão **"Iniciar preparação"**: Pendente → Em preparação), o talão sai sozinho na
impressora da cozinha e/ou do balcão, conforme as categorias dos produtos. Isto vale também para pedidos aceites no site
central, que chegam ao restaurante pela sincronização.

```
Cliente (QR Code) → pedido no painel → gerente aceita → servidor local do restaurante → impressora (ESC/POS) → talão
```

## Onde corre

A impressão é feita pelo **servidor local do restaurante** (ver `docs/servidor-local.md`), porque só ele está na mesma
rede das impressoras. O site na internet (Vercel) **não chega** às impressoras da rede local nem às USB. No site central,
a página *Impressoras* explica isto e não cria trabalhos de impressão.

- Ativo automaticamente com `NOKAU_ROLE=local`.
- Num servidor próprio sem sincronização: `NOKAU_PRINT_AGENT=1`.
- Opcional: `NOKAU_PRINT_INTERVAL_MS` controla de quanto em quanto tempo se verifica a fila (por defeito 1000 ms).

## Impressoras compatíveis

Impressoras térmicas **ESC/POS** de 58 mm ou 80 mm (Epson TM-T20/T82/T88, Xprinter, Rongta, HPRT, Bixolon, Star em modo
ESC/POS e a generalidade das "POS-80"). O sistema usa só comandos do conjunto base:

- inicializar;
- tabela de caracteres;
- alinhamento;
- negrito;
- tamanho;
- corte (`GS V`);
- pedido de estado (`DLE EOT`).

| Ligação | Estado | Notas |
|---|---|---|
| **Rede Wi-Fi / Ethernet** (porta RAW 9100) | ✅ Recomendado | Funciona em Linux e Windows. Deteta sem papel e tampa aberta quando a impressora responde a `DLE EOT`. |
| **USB** | ✅ Só em Linux | Escreve diretamente em `/dev/usb/lp0` (ou `/dev/lpN`). Sem deteção de papel. |
| Bluetooth BLE | ❌ Não implementado | Exige biblioteca nativa (BlueZ) e emparelhamento no servidor; não foi possível testar. Alternativa: impressora de rede. |
| Terminais Android (Sunmi, iMin) | ❌ Não implementado | A impressora interna só é acessível por uma app Android nativa com o SDK do fabricante. Seria um projeto à parte. |
| Impressão pelo navegador | ❌ Não usado | Exige confirmação manual em cada talão. Não serve para impressão automática. |

## Preparar a impressora de rede

1. Ligar a impressora ao router (cabo de preferência) e imprimir a **folha de configuração**. Na maioria dos modelos,
   ligue-a com o botão FEED premido; a folha mostra o IP.
2. Dar-lhe um **IP fixo**, por reserva DHCP no router ou na própria impressora (ex.: `192.168.1.50`).
3. Confirmar que a porta **9100** (RAW / JetDirect) está ativa. É o padrão.
4. Escolher a tabela de caracteres **PC860 (Português)** se o modelo a tiver. Caso contrário, use PC850 ou "Sem acentos".

## Impressora USB (Linux)

1. Ligar a impressora. Deve aparecer `/dev/usb/lp0` (`ls /dev/usb/`).
2. Dar acesso ao utilizador que corre o servidor: `sudo usermod -aG lp <utilizador>` e reiniciar a sessão.
3. No painel, escolher **USB** e indicar `/dev/usb/lp0`. Só são aceites caminhos de dispositivos de impressora.

## Configurar no painel

Abrir o painel **no servidor local** (ex.: `http://192.168.1.10:3000/admin/impressoras`) com uma conta de gerente.

1. **Adicionar impressora** e preencher:
   - nome;
   - posto: **Cozinha** ou **Balcão/Bar**;
   - ligação: rede (IP + porta) ou USB;
   - largura do papel: 58 ou 80 mm;
   - tabela de caracteres;
   - número de cópias;
   - **categorias** que imprime. Ex.: cozinha = pratos, balcão = bebidas. Sem categorias = imprime tudo.
2. **Testar ligação**: verifica se a impressora responde e se tem papel. Não imprime nada.
3. **Imprimir teste**: sai um talão com a largura, os acentos (`Nô Kau · Camarão · Ação · Pão`) e o corte.
   Se os acentos saírem errados, mude a tabela de caracteres.
4. Só os pedidos aceites **depois** de a impressora ser ativada são impressos. Ativar uma impressora não imprime o
   histórico antigo.

## Fila, falhas e histórico

| Situação | O que acontece |
|---|---|
| Impressora desligada / sem rede | O talão fica na fila. Tenta de novo após 2 s, 5 s, 15 s, 30 s e 60 s, depois fica **Falhou**: use *Tentar de novo*. |
| Sem papel / tampa aberta | Não envia e espera, sem gastar tentativas. Sai sozinho quando o problema é resolvido. |
| Servidor desligado a meio de um envio | O trabalho fica **Incerto** e **nunca** é reenviado sozinho, para evitar talões em dobro. Confirme na impressora e use *Imprimir de novo* se for preciso. |
| Aceitar o mesmo pedido outra vez / reiniciar o servidor | Não imprime de novo. A chave única pedido + impressora impede duplicados. |
| Reimpressão manual | Botão *Reimprimir* no histórico. O talão sai com a marca **REIMPRESSÃO**. Um duplo toque conta como uma só reimpressão. |

O histórico mostra os últimos 150 trabalhos (pedido, mesa, impressora, estado, tentativas, erro, quem pediu).

## Conteúdo do talão

- Restaurante e posto (COZINHA / BALCAO / BAR).
- **Mesa** em letra grande.
- Número do pedido e data/hora (hora da Guiné-Bissau).
- Quem aceitou o pedido.
- Cada produto: quantidade, nome, total da linha, preço unitário (se mais de 1) e **observações** (`>> sem picante`).
- Total. No talão de cada posto, o total conta só os produtos desse posto.
- Corte do papel. As impressoras sem guilhotina ignoram o corte.

## Como foi testado

- Impressora **virtual** ESC/POS por TCP (porta RAW, como uma impressora de rede real) e escrita num ficheiro de
  dispositivo para o modo USB.
- A impressora virtual interpreta os comandos e recusa os desconhecidos. Também descodifica PC860/PC850 e responde aos
  pedidos de estado de papel e tampa.
- O fluxo completo foi testado de ponta a ponta: pedido por QR, aceitação no painel local e no central, talão impresso,
  falhas, recuperação, duplicados e reimpressão.
- **A impressão física numa impressora real ainda não foi confirmada**. Faça *Testar ligação* e *Imprimir teste* com a
  impressora do restaurante antes de usar em serviço.
