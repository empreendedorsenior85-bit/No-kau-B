# Personalização de Recibos (recibos e talões)

**Onde:** Painel → **Recibos** (`/admin/recibos`). Só Admin. Edita-se no site central; o servidor do restaurante recebe a configuração sozinho em cerca de 1 minuto. O logótipo só é descarregado quando muda.

## O que se configura

| Secção | Opções |
|---|---|
| Cabeçalho | Logótipo (PNG/JPG, guardado em tons de cinzento), nome da loja, morada e telefone, texto de boas-vindas. |
| Informações da venda | Número (recibo `REC-…` / número do pedido), data, hora, funcionário (quem recebeu / quem aceitou), mesa. |
| Cliente | Nome e telefone da conta do cliente. Campos vazios nunca são impressos. |
| Financeiro | Subtotal, total, método, valor recebido e troco (só em numerário), moeda (FCFA / XOF). |
| Rodapé | QR Code da loja online (só `https://`) e texto por baixo, agradecimento, nota especial, data/hora de impressão, NIF, condições de devolução e avisos legais. |
| Formato | 58 ou 80 mm; texto pequeno, médio ou grande; imprimir o recibo no balcão ao confirmar o pagamento. |

**Ainda não existem no sistema:** descontos, impostos/taxas, taxa de entrega e endereço de entrega. Por isso não há opções para eles: nunca se mostram valores inventados.

## Como é aplicado

- **Um só desenho.** A mesma descrição do recibo gera:
  - os bytes da impressora térmica (ESC/POS);
  - a pré-visualização;
  - o recibo no ecrã, que se pode imprimir no navegador ou guardar em PDF.
- **Tamanho do texto na impressora:**
  - pequeno = fonte B (42 colunas em 58 mm, 64 em 80 mm);
  - médio = fonte A (32 / 48 colunas);
  - grande = fonte A em dupla altura.
- **Logótipo e QR:** são impressos como imagem a preto e branco (`GS v 0`). Isto funciona em quase todas as impressoras térmicas, também por Bluetooth e USB. O QR impresso foi lido com um descodificador nos testes.
- **Largura:** cada impressora usa a largura do papel que tem, definida em **Impressoras**. A largura escolhida aqui serve para o recibo no ecrã/PDF e para as impressoras novas.
- **Talões de cozinha e balcão:** seguem as informações da venda e do cliente, mas sem logótipo, QR nem publicidade.
- **Recibo térmico:**
  - no servidor do restaurante, o botão **"Imprimir no talão"** na página do recibo;
  - ou automático ao confirmar o pagamento, nas impressoras do **balcão**.
