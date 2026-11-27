# Catálogo — inventário de imagens

Fonte oficial dos produtos, preços, descrições e categorias: `src/content/nokau-menu.ts` (ementa original transcrita, 171 produtos em 19 categorias). Nada foi alterado nos nomes, preços, descrições ou categorias.

Gerado a 27/11/2026.

## 1. Origem das imagens

A pasta `pratos/` **não existia** no projeto (nem no repositório no GitHub, em nenhum ramo). As únicas fotografias recebidas foram **5**, enviadas na conversa a 27/11/2026. Foram guardadas **sem alterações** em `pratos/recebidas-2026-11-27/` (foto-1 … foto-5, pela ordem em que chegaram; o SHA-256 confere com o ficheiro recebido). As 5 são de **vinho tinto**. Nenhuma é de comida.

**As 5 fotografias aparentam ser geradas por IA:** o texto pequeno dos rótulos é ilegível ou deformado e há gralhas («PORTURAL», «TINTD»). Os rótulos **não são os rótulos verdadeiros** das marcas, por isso só podem ser usadas como **imagem ilustrativa**. O menu mostra automaticamente a etiqueta «Imagem ilustrativa» em tudo o que está em `public/menu/ilustrativas/`.

## 2. Imagens analisadas

| ID | Ficheiro original | Formato · dimensões | SHA-256 (início) | O que se vê (análise visual do rótulo) | Correspondência | Estado |
|---|---|---|---|---|---|---|
| IMG-001 | `pratos/recebidas-2026-11-27/foto-1.jpg` | JPEG · 1024×1024 | 4bd18e61e0721cb3 | Garrafa de tinto, rótulo «CASA DE SANTAR · Portuguese Red Wine · **750 ml**», faixa vermelha; sem «Reserva». Copo de tinto, uvas, queijo, pão | **Casa de Santar (750 ml)** · 12 000 FCFA | ✅ Associada (ilustrativa) |
| IMG-002 | `pratos/recebidas-2026-11-27/foto-2.jpg` | JPEG · 1024×1024 | b7838859fa4a87d0 | Rótulo «CASA DE SANTAR · DÃO · DOC Portural [sic] · **RESERVA**»; «**375 ml**» no gargalo e no rótulo. Presunto, azeitonas, pão | Casa de Santar Reserva · 22 000 FCFA? | ⏳ **Pendente de confirmação**: a ementa não diz o tamanho do «Casa de Santar Reserva», e esta foto mostra meia garrafa (375 ml). Não foi publicada. |
| IMG-003 | `pratos/recebidas-2026-11-27/foto-3.jpg` | JPEG · 1024×1024 | a5e87817e073e674 | Rótulo «CASA DE SANTAR · **RESERVA** · DÃO · Portugal», sem tamanho visível; copo de tinto, pão, queijo, azeitonas | **Casa de Santar Reserva** · 22 000 FCFA | ✅ Associada (ilustrativa) |
| IMG-004 | `pratos/recebidas-2026-11-27/foto-4.jpg` | JPEG · 1024×1024 | cf6d08936077cfb0 | Rótulo «QUINTA CABRIZ · DÃO DOC · Tintd [sic] **RESERVA** · **375 ml** · 13,5% vol»; presunto, azeitonas, pão | — | ❌ **Sem correspondência**: a ementa só tem «Quinta Cabriz Tinto» (sem «Reserva») e «Quinta Cabriz Branco». Um Reserva é outro vinho. Não foi publicada. |
| IMG-005 | `pratos/recebidas-2026-11-27/foto-5.jpg` | JPEG · 1024×1024 | fce1280cd6d3795e | Rótulo «QUINTA CABRIZ · DÃO · 750 ml», sem «Reserva»; **vinho tinto no copo** (o rótulo não diz «Tinto»). Pão, azeitonas, manteiga | **Quinta Cabriz Tinto** · 12 000 FCFA | ✅ Associada (ilustrativa): é o único Cabriz tinto da ementa; o branco fica excluído pela cor do vinho |

### Segundo lote (recebido na conversa a 27/11/2026, sem ficheiro)

Estas 5 fotografias chegaram **só como imagem na conversa**, sem ficheiro anexado. Foram analisadas, mas **não podem ser guardadas nem publicadas** até serem enviadas como ficheiros, por exemplo para \`pratos/\` no repositório. Também aparentam ser geradas por IA (texto pequeno deformado nos rótulos).

| ID | O que se vê | Correspondência na ementa | Estado |
|---|---|---|---|
| IMG-006 | Garrafa «Casa Ferreirinha · **Papa Figos** · Douro», **vinho tinto** no copo; pão, manteiga | **Papa Figos** · 10 000 FCFA · «Vinho tinto» | ✅ Correspondência confirmada · **aguarda o ficheiro** |
| IMG-007 | Garrafa azul «**Gato Azul** · Vinho Verde · Portugal», vinho claro no copo | Gato Azul · 10 000 FCFA · «Vinho **branco**» | ⏳ **Pendente**: o rótulo diz «Vinho Verde», mas a ementa classifica-o como branco (VB) |
| IMG-008 | Garrafa «**Cacho Fresco** · Vinho Verde · Espumante», flûte com espumante | **Cacho Fresco (Espumante)** · 15 000 FCFA | ✅ Correspondência confirmada · **aguarda o ficheiro** |
| IMG-009 | Salada niçoise: atum, ovo cozido, feijão-verde, batata, tomate-cereja, azeitonas pretas, anchovas, alcaparras, cebola roxa; **sem milho** | Salada Noçoise · 5 000 FCFA · «Salada de atum, ovo e **milho**» | ⏳ **Pendente**: a foto não tem milho e tem ingredientes que a ementa não indica. O produto já tem uma imagem ilustrativa, que não foi substituída |
| IMG-010 | Salada de frango grelhado: alface, rúcula, tomate-cereja, pepino, milho, pimento vermelho, queijo, croutons, molho branco | **Salada de Frango** · 4 000 FCFA · (a ementa não tem descrição) | ✅ Correspondência pelo nome e pelo prato · **o gerente deve confirmar os ingredientes** · **aguarda o ficheiro** |

### Terceiro lote (recebido na conversa a 27/11/2026, sem ficheiro)

Tal como o segundo lote, estas 11 fotografias chegaram **só como imagem na conversa** e precisam de ser reenviadas como ficheiros. A comparação foi feita com a descrição **oficial** de cada produto. Quando a fotografia mostra acompanhamentos diferentes dos da ementa, fica pendente: o cliente veria um prato diferente do que vai receber.

| ID | O que se vê | Produto candidato (ementa) | Estado |
|---|---|---|---|
| IMG-011 | Salada de tomate às rodelas, cebola roxa, azeitonas pretas, manjericão, azeite | **Salada de Tomate** · 1 500 FCFA (sem descrição) | ✅ Confirmada · aguarda o ficheiro |
| IMG-012 | Tábua de queijos, salame, chouriço, presunto, azeitonas, frutos secos, uvas, pão | **Tábua de Queijo, Enchidos e Azeitonas** · 10 000 FCFA | ✅ Confirmada · aguarda o ficheiro |
| IMG-013 | Peixe inteiro grelhado com batatinhas, espargos, tomate-cereja e limão; **sem arroz** | Bica (500 g / 1 kg) ou Simpote: «com arroz, molho acebolado e salada» | ⏳ Pendente: a espécie não é identificável e os acompanhamentos não coincidem |
| IMG-014 | Filete de peixe com camarão em molho de tomate, batata cozida, espargos | Filete Marinheiro · 9 000 FCFA: «com camarão, **arroz, batata frita e salada**» | ✅ Aprovada pelo dono (27/11/2026): pode mostrar outros acompanhamentos · aguarda o ficheiro |
| IMG-015 | Espetada de frango com pimentos e cebola, batata assada, salada, limão; **sem arroz** | Espetada de Frango · 8 000 FCFA: «com **arroz**, batata frita e salada» | ✅ Aprovada pelo dono (27/11/2026): pode mostrar outros acompanhamentos · aguarda o ficheiro |
| IMG-016 | Cordon bleu panado, recheado com fiambre e queijo; **puré**, espargos, salada | Cordon Bleu · 10 000 FCFA: «…acompanhado de **arroz, batata frita** e salada» | ✅ Aprovada pelo dono (27/11/2026): pode mostrar outros acompanhamentos · aguarda o ficheiro |
| IMG-017 | Omelete simples dobrada, cebolinho, salada, pão (no prato) | **Omelete Simples no Prato** · 2 000 FCFA (sem descrição) | ✅ Confirmada · aguarda o ficheiro |
| IMG-018 | Omelete recheada com atum, batatinhas, salada, pão | **Omelete de Atum** · 3 000 FCFA (sem descrição) | ✅ Confirmada · aguarda o ficheiro |
| IMG-019 | Wrap de frango (shawarma) com alface, tomate, pepino, cebola, molho branco | Shawarma Simples (1 500) **ou** Shawarma Nô Kau (2 000) | ⏳ Pendente: não se distingue qual das duas variantes é |
| IMG-020 | Pastéis fritos em meia-lua (tipo fataya) com salada e molhos | Fataya Simples (1 000) **ou** Fataya Completo (1 500) | ⏳ Pendente: o prato não está confirmado e a variante não se distingue |
| IMG-021 | Pizza de frango desfiado, milho, cebola roxa, mozzarella, manjericão | Pizza de Frango (Média 5 000 / Grande 7 500) | ⏳ Pendente: o tamanho não se vê; o gerente decide se a mesma foto serve para os dois tamanhos |

**Duplicadas:** nenhum ficheiro repetido (os 5 SHA-256 são diferentes). IMG-002 e IMG-003 mostram o **mesmo produto** (Casa de Santar Reserva). Ficou a IMG-003, porque não mostra um tamanho que possa contradizer a ementa.

## 3. Versões otimizadas (cópias; os originais ficam intactos)

| Produto | Ficheiro publicado | Formato |
|---|---|---|
| Casa de Santar (750 ml) | `public/menu/ilustrativas/vinhos-champagne/casa-de-santar-750ml.webp` | WebP 800×537 (o mesmo formato das ilustrativas existentes) |
| Casa de Santar Reserva | `public/menu/ilustrativas/vinhos-champagne/casa-de-santar-reserva.webp` | WebP 800×537 |
| Quinta Cabriz Tinto | `public/menu/ilustrativas/vinhos-champagne/quinta-cabriz-tinto.webp` | WebP 800×537 |

A fotografia quadrada fica **inteira e sem deformação** ao centro, sobre um fundo desfocado da própria imagem, para que o enquadramento horizontal do menu não corte a garrafa.

## 4. Relatório

| | Número |
|---|---|
| Fotografias recebidas | **21** (5 com ficheiro + 16 só na conversa) |
| Fotografias identificadas | **21** |
| Associadas e implementadas (confirmadas, com ficheiro) | **3** |
| Correspondência confirmada, à espera do ficheiro | **10** (IMG-006, 008, 010, 011, 012, 014, 015, 016, 017, 018) |
| Pendentes de confirmação | **7** (IMG-002, 007, 009, 013, 019, 020, 021) |
| Sem correspondência na ementa | **1** (IMG-004) |
| Ficheiros duplicados | **0** (2 fotos do mesmo produto: IMG-002 e IMG-003) |
| Produtos da ementa | **171** |
| Produtos com imagem (todas ilustrativas) | **10** (7 anteriores + 3 novas) |
| Produtos sem fotografia | **161** |

**Para rever:** uma mesma imagem ilustrativa anterior (`peixe-grelhado.webp`) aparece em «Bica (500 g)» e «Bica (1 kg)». É o mesmo prato em dois tamanhos, mas, pela regra «uma foto não representa outro produto», o gerente deve decidir se fica assim. Não foi alterado.

### Fotografias por categoria

| Categoria | Produtos | Com imagem | Sem imagem |
|---|---|---|---|
| Entradas | 9 | 1 | 8 |
| Peixes & Mariscos Grelhados | 6 | 3 | 3 |
| Peixes & Mariscos (Outros) | 3 | 1 | 2 |
| Carnes Grelhadas | 7 | 1 | 6 |
| Carnes (Outros) | 8 | 1 | 7 |
| Sandes | 7 | 0 | 7 |
| Fast Food | 7 | 0 | 7 |
| Pizzas | 12 | 0 | 12 |
| Outros | 7 | 0 | 7 |
| Refrigerantes & Sumos | 8 | 0 | 8 |
| Águas | 5 | 0 | 5 |
| Café & Chá | 2 | 0 | 2 |
| Cervejas & Cidras | 10 | 0 | 10 |
| Whiskies | 23 | 0 | 23 |
| Vodkas & Tequila | 7 | 0 | 7 |
| Gins | 8 | 0 | 8 |
| Vermute | 10 | 0 | 10 |
| Runs, Licores & Frizantes | 10 | 0 | 10 |
| Vinhos & Champagne | 22 | 3 | 19 |

**Nenhuma categoria está completa.** Para completar o catálogo faltam fotografias **reais** dos 161 produtos indicados na tabela abaixo.

## 5. Todos os produtos

| ID | Nome do produto | Categoria | Preço | Imagem original | Imagem associada | Estado |
|---|---|---|---|---|---|---|
| `entradas/linguica` | Linguiça | Entradas | 3 500 FCFA | — | — | Sem fotografia |
| `entradas/moelas` | Moelas | Entradas | 2 000 FCFA | — | — | Sem fotografia |
| `entradas/chourico` | Chouriço | Entradas | 2 000 FCFA | — | — | Sem fotografia |
| `entradas/camarao-salteado` | Camarão Salteado | Entradas | 4 000 FCFA | — | — | Sem fotografia |
| `entradas/sopa-do-dia` | Sopa do Dia | Entradas | 1 500 FCFA | — | — | Sem fotografia |
| `entradas/salada-nocoise` | Salada Noçoise | Entradas | 5 000 FCFA | (anterior · Higgsfield) | `ilustrativas/salada-nicoise.webp` | Já tinha imagem ilustrativa (anterior) |
| `entradas/salada-de-frango` | Salada de Frango | Entradas | 4 000 FCFA | — | — | Sem fotografia |
| `entradas/salada-de-tomate` | Salada de Tomate | Entradas | 1 500 FCFA | — | — | Sem fotografia |
| `entradas/tabua-de-queijo-enchidos-e-azeitonas` | Tábua de Queijo, Enchidos e Azeitonas | Entradas | 10 000 FCFA | — | — | Sem fotografia |
| `peixes-mariscos-grelhados/chocos` | Chocos | Peixes & Mariscos Grelhados | 9 000 FCFA | — | — | Sem fotografia |
| `peixes-mariscos-grelhados/bica-500-g` | Bica (500 g) | Peixes & Mariscos Grelhados | 10 000 FCFA | (anterior · Higgsfield) | `ilustrativas/peixe-grelhado.webp` | Já tinha imagem ilustrativa (anterior) |
| `peixes-mariscos-grelhados/bica-1-kg` | Bica (1 kg) | Peixes & Mariscos Grelhados | 20 000 FCFA | (anterior · Higgsfield) | `ilustrativas/peixe-grelhado.webp` | Já tinha imagem ilustrativa (anterior) |
| `peixes-mariscos-grelhados/simpote` | Simpote | Peixes & Mariscos Grelhados | 6 000 FCFA | — | — | Sem fotografia |
| `peixes-mariscos-grelhados/salmao` | Salmão | Peixes & Mariscos Grelhados | 12 000 FCFA | — | — | Sem fotografia |
| `peixes-mariscos-grelhados/camarao-tigre-gambas` | Camarão Tigre / Gambas | Peixes & Mariscos Grelhados | 17 500 FCFA | (anterior · Higgsfield) | `ilustrativas/camarao-tigre.webp` | Já tinha imagem ilustrativa (anterior) |
| `peixes-mariscos-outros/filete-marinheiro` | Filete Marinheiro | Peixes & Mariscos (Outros) | 9 000 FCFA | — | — | Sem fotografia |
| `peixes-mariscos-outros/espetada-bijagos` | Espetada Bijagós | Peixes & Mariscos (Outros) | 9 000 FCFA | (anterior · Higgsfield) | `ilustrativas/espetada-bijagos.webp` | Já tinha imagem ilustrativa (anterior) |
| `peixes-mariscos-outros/espetada-do-chef` | Espetada do Chef | Peixes & Mariscos (Outros) | 9 000 FCFA | — | — | Sem fotografia |
| `carnes-grelhadas/frango-churrasco` | Frango Churrasco | Carnes Grelhadas | 6 000 FCFA | (anterior · Higgsfield) | `ilustrativas/frango-churrasco.webp` | Já tinha imagem ilustrativa (anterior) |
| `carnes-grelhadas/costoleta-de-novilho` | Costoleta de Novilho | Carnes Grelhadas | 17 500 FCFA | — | — | Sem fotografia |
| `carnes-grelhadas/costoleta-de-porco` | Costoleta de Porco | Carnes Grelhadas | 7 000 FCFA | — | — | Sem fotografia |
| `carnes-grelhadas/grelhado-misto-de-carne` | Grelhado Misto de Carne | Carnes Grelhadas | 25 000 FCFA | — | — | Sem fotografia |
| `carnes-grelhadas/espetada-de-vaca` | Espetada de Vaca | Carnes Grelhadas | 9 000 FCFA | — | — | Sem fotografia |
| `carnes-grelhadas/espetada-de-vaca-e-frango` | Espetada de Vaca e Frango | Carnes Grelhadas | 10 000 FCFA | — | — | Sem fotografia |
| `carnes-grelhadas/espetada-de-frango` | Espetada de Frango | Carnes Grelhadas | 8 000 FCFA | — | — | Sem fotografia |
| `carnes-outros/bife-no-kau` | Bife Nô Kau | Carnes (Outros) | 9 000 FCFA | (anterior · Higgsfield) | `ilustrativas/bife-nokau.webp` | Já tinha imagem ilustrativa (anterior) |
| `carnes-outros/cordon-bleu` | Cordon Bleu | Carnes (Outros) | 10 000 FCFA | — | — | Sem fotografia |
| `carnes-outros/bife-acebolado` | Bife Acebolado | Carnes (Outros) | 8 000 FCFA | — | — | Sem fotografia |
| `carnes-outros/bife-pimenta-perta` | Bife - Pimenta Perta | Carnes (Outros) | 8 000 FCFA | — | — | Sem fotografia |
| `carnes-outros/bife-recheado-com-ovo` | Bife Recheado com Ovo | Carnes (Outros) | 10 000 FCFA | — | — | Sem fotografia |
| `carnes-outros/chawarma-no-prato` | Chawarma no Prato | Carnes (Outros) | 7 000 FCFA | — | — | Sem fotografia |
| `carnes-outros/hamburguer-no-prato` | Hamburguer no Prato | Carnes (Outros) | 7 500 FCFA | — | — | Sem fotografia |
| `carnes-outros/cafriela` | Cafriela | Carnes (Outros) | 7 500 FCFA | — | — | Sem fotografia |
| `sandes/linguica-sande` | Linguiça (Sande) | Sandes | 3 000 FCFA | — | — | Sem fotografia |
| `sandes/prego-no-pao` | Prego no Pão | Sandes | 3 000 FCFA | — | — | Sem fotografia |
| `sandes/frango-sande` | Frango (Sande) | Sandes | 2 000 FCFA | — | — | Sem fotografia |
| `sandes/iscas` | Iscas | Sandes | 2 000 FCFA | — | — | Sem fotografia |
| `sandes/atum-sande` | Atum (Sande) | Sandes | 2 000 FCFA | — | — | Sem fotografia |
| `sandes/omelete-simples-sande` | Omelete Simples (Sande) | Sandes | 1 500 FCFA | — | — | Sem fotografia |
| `sandes/omelete-mista-sande` | Omelete Mista (Sande) | Sandes | 3 000 FCFA | — | — | Sem fotografia |
| `fast-food/hamburguer-simples` | Hamburguer Simples | Fast Food | 2 000 FCFA | — | — | Sem fotografia |
| `fast-food/hamburguer-no-kau` | Hamburguer Nô Kau | Fast Food | 3 000 FCFA | — | — | Sem fotografia |
| `fast-food/shawarma-simples` | Shawarma Simples | Fast Food | 1 500 FCFA | — | — | Sem fotografia |
| `fast-food/shawarma-no-kau` | Shawarma Nô Kau | Fast Food | 2 000 FCFA | — | — | Sem fotografia |
| `fast-food/fataya-simples` | Fataya Simples | Fast Food | 1 000 FCFA | — | — | Sem fotografia |
| `fast-food/fataya-completo` | Fataya Completo | Fast Food | 1 500 FCFA | — | — | Sem fotografia |
| `fast-food/tacos` | Tacos | Fast Food | 2 500 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-de-frango-media` | Pizza de Frango (Média) | Pizzas | 5 000 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-de-frango-grande` | Pizza de Frango (Grande) | Pizzas | 7 500 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-de-atum-media` | Pizza de Atum (Média) | Pizzas | 5 000 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-de-atum-grande` | Pizza de Atum (Grande) | Pizzas | 7 500 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-de-carne-moida-media` | Pizza de Carne Moída (Média) | Pizzas | 5 000 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-de-carne-moida-grande` | Pizza de Carne Moída (Grande) | Pizzas | 7 500 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-vegetariana-media` | Pizza Vegetariana (Média) | Pizzas | 5 000 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-vegetariana-grande` | Pizza Vegetariana (Grande) | Pizzas | 7 500 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-margarita-media` | Pizza Margarita (Média) | Pizzas | 5 000 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-margarita-grande` | Pizza Margarita (Grande) | Pizzas | 7 500 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-4-estacoes-media` | Pizza 4 Estações (Média) | Pizzas | 6 500 FCFA | — | — | Sem fotografia |
| `pizzas/pizza-4-estacoes-grande` | Pizza 4 Estações (Grande) | Pizzas | 9 000 FCFA | — | — | Sem fotografia |
| `outros/omelete-simples-no-prato` | Omelete Simples no Prato | Outros | 2 000 FCFA | — | — | Sem fotografia |
| `outros/omelete-mista-no-prato` | Omelete Mista no Prato | Outros | 3 000 FCFA | — | — | Sem fotografia |
| `outros/omelete-de-frango` | Omelete de Frango | Outros | 3 000 FCFA | — | — | Sem fotografia |
| `outros/omelete-de-atum` | Omelete de Atum | Outros | 3 000 FCFA | — | — | Sem fotografia |
| `outros/omelete-de-linguica` | Omelete de Linguiça | Outros | 3 000 FCFA | — | — | Sem fotografia |
| `outros/ovo-extra` | Ovo Extra | Outros | 500 FCFA | — | — | Sem fotografia |
| `outros/batata-frita` | Batata Frita | Outros | 1 000 FCFA | — | — | Sem fotografia |
| `refrigerantes-sumos/sumo-natural` | Sumo Natural | Refrigerantes & Sumos | 800 FCFA | — | — | Sem fotografia |
| `refrigerantes-sumos/maaza` | Maaza | Refrigerantes & Sumos | 700 FCFA | — | — | Sem fotografia |
| `refrigerantes-sumos/sumol` | Sumol | Refrigerantes & Sumos | 700 FCFA | — | — | Sem fotografia |
| `refrigerantes-sumos/fanta` | Fanta | Refrigerantes & Sumos | 700 FCFA | — | — | Sem fotografia |
| `refrigerantes-sumos/sprite` | Sprite | Refrigerantes & Sumos | 700 FCFA | — | — | Sem fotografia |
| `refrigerantes-sumos/coca-cola` | Coca-Cola | Refrigerantes & Sumos | 700 FCFA | — | — | Sem fotografia |
| `refrigerantes-sumos/compal` | Compal | Refrigerantes & Sumos | 700 FCFA | — | — | Sem fotografia |
| `refrigerantes-sumos/red-bull` | Red Bull | Refrigerantes & Sumos | 2 000 FCFA | — | — | Sem fotografia |
| `aguas/agua-mineral-pequena` | Água Mineral Pequena | Águas | 500 FCFA | — | — | Sem fotografia |
| `aguas/agua-mineral-grande` | Água Mineral Grande | Águas | 1 000 FCFA | — | — | Sem fotografia |
| `aguas/agua-das-pedras` | Água das Pedras | Águas | 1 000 FCFA | — | — | Sem fotografia |
| `aguas/castelo` | Castelo | Águas | 1 000 FCFA | — | — | Sem fotografia |
| `aguas/agua-tonica` | Água Tónica | Águas | 1 000 FCFA | — | — | Sem fotografia |
| `cafe-cha/cafe` | Café | Café & Chá | 500 FCFA | — | — | Sem fotografia |
| `cafe-cha/cha` | Chá | Café & Chá | 1 000 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/super-bock-mini` | Super Bock Mini | Cervejas & Cidras | 500 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/super-bock-preta-mini` | Super Bock Preta Mini | Cervejas & Cidras | 1 000 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/super-bock-preta` | Super Bock Preta | Cervejas & Cidras | 1 500 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/cristal-mini` | Cristal Mini | Cervejas & Cidras | 500 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/cristal-lata` | Cristal Lata | Cervejas & Cidras | 1 500 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/sagres` | Sagres | Cervejas & Cidras | 500 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/guinness` | Guinness | Cervejas & Cidras | 2 000 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/heineken` | Heineken | Cervejas & Cidras | 1 000 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/somersby-mini` | Somersby Mini | Cervejas & Cidras | 1 000 FCFA | — | — | Sem fotografia |
| `cervejas-cidras/somersby-xl` | Somersby XL | Cervejas & Cidras | 1 500 FCFA | — | — | Sem fotografia |
| `whiskies/jack-daniel-s-bolha` | Jack Daniel's (Bolha) | Whiskies | 4 000 FCFA | — | — | Sem fotografia |
| `whiskies/jack-daniel-s-garrafa` | Jack Daniel's (Garrafa) | Whiskies | 40 000 FCFA | — | — | Sem fotografia |
| `whiskies/chivas-bolha` | Chivas (Bolha) | Whiskies | 4 000 FCFA | — | — | Sem fotografia |
| `whiskies/chivas-garrafa` | Chivas (Garrafa) | Whiskies | 45 000 FCFA | — | — | Sem fotografia |
| `whiskies/chivas-regal-garrafa` | Chivas Regal (Garrafa) | Whiskies | 60 000 FCFA | — | — | Sem fotografia |
| `whiskies/jim-beam-garrafa` | Jim Beam (Garrafa) | Whiskies | 30 000 FCFA | — | — | Sem fotografia |
| `whiskies/jameson-bolha` | Jameson (Bolha) | Whiskies | 3 000 FCFA | — | — | Sem fotografia |
| `whiskies/jameson-garrafa` | Jameson (Garrafa) | Whiskies | 30 000 FCFA | — | — | Sem fotografia |
| `whiskies/john-walker-white-garrafa` | John Walker White (Garrafa) | Whiskies | 40 000 FCFA | — | — | Sem fotografia |
| `whiskies/john-walker-black-bolha` | John Walker Black (Bolha) | Whiskies | 4 000 FCFA | — | — | Sem fotografia |
| `whiskies/john-walker-black-garrafa` | John Walker Black (Garrafa) | Whiskies | 50 000 FCFA | — | — | Sem fotografia |
| `whiskies/john-walker-red-bolha` | John Walker Red (Bolha) | Whiskies | 3 000 FCFA | — | — | Sem fotografia |
| `whiskies/john-walker-red-garrafa` | John Walker Red (Garrafa) | Whiskies | 30 000 FCFA | — | — | Sem fotografia |
| `whiskies/ballantines-bolha` | Ballantines (Bolha) | Whiskies | 4 000 FCFA | — | — | Sem fotografia |
| `whiskies/ballantines-garrafa` | Ballantines (Garrafa) | Whiskies | 30 000 FCFA | — | — | Sem fotografia |
| `whiskies/logan-bolha` | Logan (Bolha) | Whiskies | 3 000 FCFA | — | — | Sem fotografia |
| `whiskies/logan-garrafa` | Logan (Garrafa) | Whiskies | 30 000 FCFA | — | — | Sem fotografia |
| `whiskies/jb-bolha` | JB (Bolha) | Whiskies | 3 000 FCFA | — | — | Sem fotografia |
| `whiskies/jb-garrafa` | JB (Garrafa) | Whiskies | 20 000 FCFA | — | — | Sem fotografia |
| `whiskies/grants-bolha` | Grants (Bolha) | Whiskies | 3 000 FCFA | — | — | Sem fotografia |
| `whiskies/grants-garrafa` | Grants (Garrafa) | Whiskies | 20 000 FCFA | — | — | Sem fotografia |
| `whiskies/the-famous-grouse-bolha` | The Famous Grouse (Bolha) | Whiskies | 3 000 FCFA | — | — | Sem fotografia |
| `whiskies/the-famous-grouse-garrafa` | The Famous Grouse (Garrafa) | Whiskies | 25 000 FCFA | — | — | Sem fotografia |
| `vodkas-tequila/ciroc-azul-garrafa` | Ciroc Azul (Garrafa) | Vodkas & Tequila | 45 000 FCFA | — | — | Sem fotografia |
| `vodkas-tequila/ciros-summer-garrafa` | Ciros Summer (Garrafa) | Vodkas & Tequila | 45 000 FCFA | — | — | Sem fotografia |
| `vodkas-tequila/absolut-bolha` | Absolut (Bolha) | Vodkas & Tequila | 3 500 FCFA | — | — | Sem fotografia |
| `vodkas-tequila/absolut-garrafa` | Absolut (Garrafa) | Vodkas & Tequila | 30 000 FCFA | — | — | Sem fotografia |
| `vodkas-tequila/roberto-cavalli-vodka-garrafa` | Roberto Cavalli Vodka (Garrafa) | Vodkas & Tequila | 40 000 FCFA | — | — | Sem fotografia |
| `vodkas-tequila/el-mariachi-bolha` | El Mariachi (Bolha) | Vodkas & Tequila | 2 500 FCFA | — | — | Sem fotografia |
| `vodkas-tequila/el-mariachi-garrafa` | El Mariachi (Garrafa) | Vodkas & Tequila | 30 000 FCFA | — | — | Sem fotografia |
| `gins/bombay-bolha` | Bombay (Bolha) | Gins | 3 000 FCFA | — | — | Sem fotografia |
| `gins/bombay-garrafa` | Bombay (Garrafa) | Gins | 30 000 FCFA | — | — | Sem fotografia |
| `gins/tanqueray-bolha` | Tanqueray (Bolha) | Gins | 3 000 FCFA | — | — | Sem fotografia |
| `gins/tanqueray-garrafa` | Tanqueray (Garrafa) | Gins | 30 000 FCFA | — | — | Sem fotografia |
| `gins/gin-gordon-branco-bolha` | Gin Gordon Branco (Bolha) | Gins | 3 000 FCFA | — | — | Sem fotografia |
| `gins/gin-gordon-branco-garrafa` | Gin Gordon Branco (Garrafa) | Gins | 25 000 FCFA | — | — | Sem fotografia |
| `gins/gin-gordon-rose-bolha` | Gin Gordon Rose (Bolha) | Gins | 3 000 FCFA | — | — | Sem fotografia |
| `gins/gin-gordon-rose-garrafa` | Gin Gordon Rose (Garrafa) | Gins | 25 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-bianco-bolha` | Martini Bianco (Bolha) | Vermute | 3 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-bianco-garrafa` | Martini Bianco (Garrafa) | Vermute | 20 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-branco-bolha` | Martini Branco (Bolha) | Vermute | 3 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-branco-garrafa` | Martini Branco (Garrafa) | Vermute | 20 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-tinto-bolha` | Martini Tinto (Bolha) | Vermute | 3 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-tinto-garrafa` | Martini Tinto (Garrafa) | Vermute | 20 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-rose-bolha` | Martini Rose (Bolha) | Vermute | 3 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-rose-garrafa` | Martini Rose (Garrafa) | Vermute | 20 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-fiero-bolha` | Martini Fiero (Bolha) | Vermute | 3 000 FCFA | — | — | Sem fotografia |
| `vermute/martini-fiero-garrafa` | Martini Fiero (Garrafa) | Vermute | 20 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/bacardi-garrafa` | Bacardi (Garrafa) | Runs, Licores & Frizantes | 25 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/malibu-garrafa` | Malibu (Garrafa) | Runs, Licores & Frizantes | 30 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/baileys-bolha` | Baileys (Bolha) | Runs, Licores & Frizantes | 3 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/baileys-garrafa` | Baileys (Garrafa) | Runs, Licores & Frizantes | 35 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/amarula-garrafa` | Amarula (Garrafa) | Runs, Licores & Frizantes | 25 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/carolans-garrafa` | Carolans (Garrafa) | Runs, Licores & Frizantes | 25 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/gold-strike-garrafa` | Gold Strike (Garrafa) | Runs, Licores & Frizantes | 25 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/licor-safari-garrafa` | Licor Safari (Garrafa) | Runs, Licores & Frizantes | 24 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/hugo-garrafa` | Hugo (Garrafa) | Runs, Licores & Frizantes | 6 000 FCFA | — | — | Sem fotografia |
| `runs-licores-frizantes/hugo-graciosa-garrafa` | Hugo Graciosa (Garrafa) | Runs, Licores & Frizantes | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/casal-garcia` | Casal Garcia | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/casal-garcia-sweet` | Casal Garcia Sweet | Vinhos & Champagne | 7 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/gazela` | Gazela | Vinhos & Champagne | 7 500 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/lagosta` | Lagosta | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/sangria` | Sangria | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/faisao` | Faisão | Vinhos & Champagne | 5 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/jp-375-ml` | JP (375 ml) | Vinhos & Champagne | 5 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/jp-750-ml` | JP (750 ml) | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/adega-de-borba-alforge` | Adega de Borba Alforge | Vinhos & Champagne | 7 500 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/mundus` | Mundus | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/marques-de-borba` | Marques de Borba | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/comenda-grande` | Comenda Grande | Vinhos & Champagne | 12 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/quinta-cabriz-tinto` | Quinta Cabriz Tinto | Vinhos & Champagne | 12 000 FCFA | IMG-005 · foto-5.jpg | `ilustrativas/vinhos-champagne/quinta-cabriz-tinto.webp` | ✅ Associada (27/11/2026) · ilustrativa |
| `vinhos-champagne/casa-de-santar-750-ml` | Casa de Santar (750 ml) | Vinhos & Champagne | 12 000 FCFA | IMG-001 · foto-1.jpg | `ilustrativas/vinhos-champagne/casa-de-santar-750ml.webp` | ✅ Associada (27/11/2026) · ilustrativa |
| `vinhos-champagne/casa-de-santar-375-ml` | Casa de Santar (375 ml) | Vinhos & Champagne | 7 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/casa-de-santar-reserva` | Casa de Santar Reserva | Vinhos & Champagne | 22 000 FCFA | IMG-003 · foto-3.jpg | `ilustrativas/vinhos-champagne/casa-de-santar-reserva.webp` | ✅ Associada (27/11/2026) · ilustrativa · alternativa pendente: IMG-002 (foto-2.jpg, 375 ml) — tamanho por confirmar |
| `vinhos-champagne/papa-figos` | Papa Figos | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/quinta-cabriz-branco-750-ml` | Quinta Cabriz Branco (750 ml) | Vinhos & Champagne | 12 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/quinta-cabriz-branco-375-ml` | Quinta Cabriz Branco (375 ml) | Vinhos & Champagne | 7 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/gato-azul` | Gato Azul | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/cacho-fresco-espumante` | Cacho Fresco (Espumante) | Vinhos & Champagne | 15 000 FCFA | — | — | Sem fotografia |
| `vinhos-champagne/bar-royal` | Bar Royal | Vinhos & Champagne | 10 000 FCFA | — | — | Sem fotografia |
