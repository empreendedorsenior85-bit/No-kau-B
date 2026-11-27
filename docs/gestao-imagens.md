# Gestão de imagens dos produtos — relatório técnico

## 1. Ponto de partida (o que já existia e foi preservado)

| Já existia | Mantido |
|---|---|
| Uma imagem por produto: foto carregada (`menu_items.image`, WebP ≤ 800 px) **ou** ilustrativa (`menu_items.image_path`, ficheiro em `public/menu/ilustrativas/`) | ✅ O menu, o POS e a sincronização leem as mesmas colunas |
| Endereço com versão `/api/menu-image/{id}?v={image_version}`, em cache para sempre | ✅ Sem alterações ao contrato |
| Otimização no carregamento (`src/lib/images.ts`: WebP, sem EXIF/GPS, ≤ 800 px) | ✅ Reutilizada |
| Redução no telemóvel antes de enviar (≤ 900 px, JPEG) | ✅ Mantida: upload rápido em 3G e base de dados pequena |
| Sincronização com o servidor local (`src/lib/sync/catalog-sync.ts`) | ✅ Inalterada |
| Carregar e remover foto na página **Menu** | ✅ Continua a ser ali; o painel Imagens não duplica |

**Problemas encontrados:**
1. **Substituir ou remover uma foto apagava a anterior.** Não havia histórico.
2. **O original perdia-se.** Só ficava a versão reduzida, e a rota `/api/menu-image` reescrevia as fotos antigas grandes por cima do original.
3. **Não havia verificação nem monitorização** de imagens indisponíveis.

## 2. Solução (aditiva, por fases)

### F1 — Dados (`MIGRATE_IMAGES_SQL` em `src/db/schema.ts`, migração idempotente com advisory lock 727016)
- **`menu_item_images`:** cada versão de imagem de cada produto.
  - **Identificação:** `id` UUID único, `item_id`, `version`, `sha256` da versão servida e `original_sha256`.
  - **Origem e estado:** `source` (`upload` | `static` | `legacy` | `restore`) e `status` (`current` | `replaced` | `removed`).
  - **Ficheiros:** `original` (bytes tal como chegaram ao servidor) e `optimized` (WebP servido), com tamanhos e dimensões.
  - **Rasto:** autor e datas.
  - **Garantias:** um índice único parcial garante **uma só versão atual por produto**. **Sem FK com cascata**, para o histórico sobreviver mesmo que o produto seja apagado.
- **`image_failures`:** monitorização de falhas (`client_load` = não carregou no telemóvel de um cliente; `server_check` = verificação). Guarda 60 dias.
- **Registo inicial:** as imagens atuais entram no histórico como `legacy` (foto sem original) ou `static` (ilustrativa).

### F2 — Lógica central (`src/lib/menu-images.ts`)
- **`saveUploadedImage`:** guarda o original intacto e gera a versão otimizada a partir dele. Na mesma transação, retira a versão atual (`replaced`) e atualiza `menu_items`.
- **`removeImage`:** o produto fica sem imagem; a versão fica `removed` e pode ser restaurada.
- **`restoreImage`:** cria uma **nova** versão (`restore`, com `restored_from`); a atual fica guardada. O histórico só cresce.
- **`recordStaticImage`:** regista as ilustrativas ligadas pela importação da ementa.
- **`archiveBeforeNormalize`:** antes de a rota reduzir uma foto antiga, guarda o original no histórico.
- **Integração nos fluxos existentes:**
  - `saveItemAction` (guardar produto com foto, agora numa transação);
  - `removeItemImageAction`;
  - `importCatalogAction`;
  - `/api/menu-image/[id]`.

### F3 — Verificação e monitorização
- **No servidor**, `checkAllImages` percorre todos os produtos ativos:
  - foto guardada: confirma que é uma imagem descodificável (sharp);
  - ilustrativa: faz um pedido `HEAD` ao próprio site e confirma `200` e `image/*`.
  - As falhas ficam em `image_failures` e no registo (`menu_image.check_failed`).
- **No navegador**, o componente `MenuImg` (menu público e menu da mesa/POS) atua quando uma imagem não carrega:
  - mostra um **fundo neutro** em vez do ícone de imagem partida (o cartão não salta);
  - avisa `POST /api/menu-image-falha`.
- **Endpoint público, protegido:** só aceita produtos que existam e caminhos de imagem do menu; regista no máximo 1 falha por produto por hora e 200 por hora no total; responde sempre `204`.

### F4 — Painel **Imagens** (`/admin/imagens`, Admin e Gerente; Garçom é reencaminhado)
- **Resumo:** produtos, fotos carregadas, ilustrativas, sem imagem e falhas dos últimos 7 dias.
- **«Verificar todas as imagens agora»:** mostra cada problema e a causa (ex.: «ficheiro indisponível (HTTP 404)»).
- **Por produto:** miniatura, origem, versão, tamanho e histórico completo, com data, autor, tamanhos, dimensões, SHA-256, **Restaurar** e **descarregar o original**.
- **Rota protegida** `GET /api/admin/menu-image-history/{uuid}[?f=original]`: 403 para quem não é Admin ou Gerente.

## 3. Evidências dos testes

**`tests/e2e/imagens.js` — 31 verificações, passou em duas execuções seguidas.**

| # | Verificação | Resultado |
|---|---|---|
| 1.1–1.2 | Tabelas criadas; cada produto com imagem tem exatamente 1 versão «atual» | ✅ |
| 2.1–2.3 | Carregar foto real pelo painel: original JPEG guardado (SHA-256 confere); otimizada WebP 800 px; o menu serve exatamente a otimizada | ✅ |
| 3.1–3.2 | Substituir: a versão anterior fica «Substituída» com original e otimizada; nada apagado | ✅ |
| 4.1 | Remover: produto sem foto, versão guardada como «Removida» | ✅ |
| 5.1–5.5 | Painel: histórico visível; **Restaurar** a 1.ª versão devolve exatamente a 1.ª foto; o restauro é uma nova versão; o histórico só cresce | ✅ |
| 6.1–6.2 | Original descarregado é byte a byte o guardado; sem sessão: 403 | ✅ |
| 7.1–7.3 | Verificação aponta o produto com ficheiro em falta (HTTP 404) e regista a falha; só esse | ✅ |
| 8.1–8.3 | No telemóvel do cliente, a imagem em falta mostra fundo neutro (sem ícone partido) e o aviso é registado; avisos com caminhos estranhos são ignorados | ✅ |
| 9.1–9.3 | **Menu público:** a foto aparece (carregada); nos **detalhes do produto** (verso do cartão) aparece a miniatura; nenhuma imagem partida | ✅ |
| 9.4–9.5 | **POS** (sessão da equipa no menu da mesa): a foto aparece; **os 11 produtos com imagem mostram-na**, nenhuma partida, nenhuma a mais | ✅ |
| 10.0–10.3 | Gerente acede; Garçom não acede ao painel nem ao histórico (403) | ✅ |
| 11.1 | Nomes e preços de todos os produtos iguais antes e depois | ✅ |

**Regressão completa** (`npm run test:e2e`, 27/11/2026): **32 de 32 conjuntos sem falhas**, 1 821 verificações. Verificação de tipos, lint e compilação sem erros. Inclui a navegação (387 verificações, com a entrada nova «Imagens» no menu lateral), os pedidos pelo QR Code e pelo POS, a sincronização com o servidor local e as fotos do catálogo.

Capturas: `tests/e2e/out/shots/imagens-painel.png`, `imagens-painel-restaurado.png`, `imagens-menu-frente.png`, `imagens-menu-detalhes.png` e `imagens-pos.png`.

## 4. Limitações e decisões (com honestidade)
- **«Original» = o ficheiro que chega ao servidor.** O painel reduz a foto no telemóvel para ≤ 900 px antes de a enviar (já era assim). Desta forma, o envio é rápido em 3G e a base de dados (Neon, plano gratuito de 0,5 GB) não enche com fotos de 4 MB. A fotografia da câmara em resolução total não é guardada. Se o restaurante quiser guardá-la, é preciso aumentar o limite de envio e ter mais espaço de base de dados.
- **Fotos anteriores a este sistema:** entram como `legacy` sem original, porque o original já tinha sido descartado antes.
- **Servidor local:** recebe as imagens pela sincronização, como antes; o histórico existe só no site central, que é onde se editam.
- **Verificação:** corre quando se carrega no botão do painel, não de forma agendada (não há tarefas agendadas configuradas no alojamento). As falhas no telemóvel dos clientes são registadas automaticamente.
- **Fotografias por publicar:** as 16 fotografias recebidas só na conversa continuam por enviar como ficheiro (ver `docs/catalogo-imagens-inventario.md`).
