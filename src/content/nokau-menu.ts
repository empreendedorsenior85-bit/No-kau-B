/**
 * EMENTA ORIGINAL DO NÔ KAU — transcrita das três ementas fornecidas pelo restaurante.
 * Preços em FCFA (xof), exatamente como na ementa. Nada aqui foi inventado.
 *  - `review`: algo na ementa está ilegível, ambíguo ou foi corrigido (gralha) → o gerente confirma no painel.
 *  - Produtos com dois preços na ementa (Bolha/Garrafa, tamanhos) são dois produtos, para se poderem pedir.
 *  - Itens repetidos entre ementas (mesmo nome e preço) foram unidos num só.
 */
import { ILLUSTRATIVE_DIR } from "@/lib/illustrative";

export type CatalogCategory ={ id: string; label: string; description: string; position: number };
export type CatalogItem = { cat: string; name: string; price: number; desc?: string; review?: string; image?: string };

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { id: "entradas", label: "Entradas", description: "Para começar.", position: 1 },
  { id: "peixes-mariscos-grelhados", label: "Peixes & Mariscos Grelhados", description: "Da grelha.", position: 2 },
  { id: "peixes-mariscos-outros", label: "Peixes & Mariscos (Outros)", description: "Filetes e espetadas.", position: 3 },
  { id: "carnes-grelhadas", label: "Carnes Grelhadas", description: "Da brasa.", position: 4 },
  { id: "carnes-outros", label: "Carnes (Outros)", description: "Bifes e pratos da casa.", position: 5 },
  { id: "sandes", label: "Sandes", description: "Com ovo: + 500 FCFA.", position: 6 },
  { id: "fast-food", label: "Fast Food", description: "Rápido e bom.", position: 7 },
  { id: "pizzas", label: "Pizzas", description: "Média ou grande.", position: 8 },
  { id: "outros", label: "Outros", description: "Omeletes e acompanhamentos.", position: 9 },
  { id: "refrigerantes-sumos", label: "Refrigerantes & Sumos", description: "", position: 10 },
  { id: "aguas", label: "Águas", description: "", position: 11 },
  { id: "cafe-cha", label: "Café & Chá", description: "", position: 12 },
  { id: "cervejas-cidras", label: "Cervejas & Cidras", description: "", position: 13 },
  { id: "whiskies", label: "Whiskies", description: "Preço por bolha ou por garrafa.", position: 14 },
  { id: "vodkas-tequila", label: "Vodkas & Tequila", description: "Preço por bolha ou por garrafa.", position: 15 },
  { id: "gins", label: "Gins", description: "Preço por bolha ou por garrafa.", position: 16 },
  { id: "vermute", label: "Vermute", description: "Preço por bolha ou por garrafa.", position: 17 },
  { id: "runs-licores-frizantes", label: "Runs, Licores & Frizantes", description: "Preço por bolha ou por garrafa.", position: 18 },
  { id: "vinhos-champagne", label: "Vinhos & Champagne", description: "VB = branco · VT = tinto · VV = verde.", position: 19 },
];

const I = (cat: string, name: string, price: number, desc?: string, review?: string): CatalogItem => ({ cat, name, price, desc, review });
/** Bebida com preço por bolha e/ou por garrafa. */
const BG = (cat: string, name: string, bolha: number | null, garrafa: number | null, review?: string): CatalogItem[] => [
  ...(bolha != null ? [I(cat, `${name} (Bolha)`, bolha, undefined, review)] : []),
  ...(garrafa != null ? [I(cat, `${name} (Garrafa)`, garrafa, undefined, review)] : []),
];
const ARROZ = "Com arroz, batata frita e salada";
const GAL = "Gralha da ementa corrigida (confirmar)";

export const CATALOG_ITEMS: CatalogItem[] = [
  // ----- ENTRADAS -----
  I("entradas", "Linguiça", 3500), I("entradas", "Moelas", 2000), I("entradas", "Chouriço", 2000),
  I("entradas", "Camarão Salteado", 4000), I("entradas", "Sopa do Dia", 1500, undefined, "Na ementa de sandes aparece “Sopa” a 1.500: foi unida a este produto (confirmar se são iguais)."),
  I("entradas", "Salada Noçoise", 5000, "Salada de atum, ovo e milho"), I("entradas", "Salada de Frango", 4000),
  I("entradas", "Salada de Tomate", 1500), I("entradas", "Tábua de Queijo, Enchidos e Azeitonas", 10000),
  // ----- PEIXES & MARISCOS GRELHADOS -----
  I("peixes-mariscos-grelhados", "Chocos", 9000, "Grelhados com arroz, batata cozida, molho acebolado e salada"),
  I("peixes-mariscos-grelhados", "Bica (500 g)", 10000, "Grelhada com arroz, molho acebolado e salada"),
  I("peixes-mariscos-grelhados", "Bica (1 kg)", 20000, "Grelhada com arroz, molho acebolado e salada"),
  I("peixes-mariscos-grelhados", "Simpote", 6000, "Grelhado com arroz, molho acebolado e salada"),
  I("peixes-mariscos-grelhados", "Salmão", 12000, "Grelhado com legumes salteados"),
  I("peixes-mariscos-grelhados", "Camarão Tigre / Gambas", 17500, "Grelhado com batata frita, salada e molho verde"),
  // ----- PEIXES & MARISCOS (OUTROS) -----
  I("peixes-mariscos-outros", "Filete Marinheiro", 9000, "Filete de peixe com camarão, arroz, batata frita e salada"),
  I("peixes-mariscos-outros", "Espetada Bijagós", 9000, "Espetada de peixe, chocos e camarão com arroz, batata frita e salada"),
  I("peixes-mariscos-outros", "Espetada do Chef", 9000, "Espetada de peixe e camarão com arroz, batata e salada"),
  // ----- CARNES GRELHADAS -----
  I("carnes-grelhadas", "Frango Churrasco", 6000, ARROZ),
  I("carnes-grelhadas", "Costoleta de Novilho", 17500, "Grelhada com arroz, batata frita e molho branco"),
  I("carnes-grelhadas", "Costoleta de Porco", 7000, "Grelhada com arroz, batata frita e salada"),
  I("carnes-grelhadas", "Grelhado Misto de Carne", 25000, "Com molho de feijão preto, molho verde, arroz e pepino"),
  I("carnes-grelhadas", "Espetada de Vaca", 9000, ARROZ), I("carnes-grelhadas", "Espetada de Vaca e Frango", 10000, ARROZ),
  I("carnes-grelhadas", "Espetada de Frango", 8000, ARROZ),
  // ----- CARNES (OUTROS) -----
  I("carnes-outros", "Bife Nô Kau", 9000, "Batata frita, salada e molho verde"),
  I("carnes-outros", "Cordon Bleu", 10000, "Bife empanado recheado com queijo e fiambre, acompanhado de arroz, batata frita e salada", GAL),
  I("carnes-outros", "Bife Acebolado", 8000, "Com purê de batata e salada"),
  I("carnes-outros", "Bife - Pimenta Perta", 8000, ARROZ, "Na ementa lê-se “Pimenta Perta”: confirmar o nome (Pimenta Preta?)."),
  I("carnes-outros", "Bife Recheado com Ovo", 10000, ARROZ),
  I("carnes-outros", "Chawarma no Prato", 7000, "Com batata frita e salada"),
  I("carnes-outros", "Hamburguer no Prato", 7500, "Com batata frita e salada"), I("carnes-outros", "Cafriela", 7500, "Com batata frita e salada"),
  // ----- SANDES (ementa 3) — “Com ovo: + 500 xof” -----
  I("sandes", "Linguiça (Sande)", 3000), I("sandes", "Prego no Pão", 3000), I("sandes", "Frango (Sande)", 2000),
  I("sandes", "Iscas", 2000), I("sandes", "Atum (Sande)", 2000), I("sandes", "Omelete Simples (Sande)", 1500), I("sandes", "Omelete Mista (Sande)", 3000),
  // ----- FAST FOOD -----
  I("fast-food", "Hamburguer Simples", 2000, undefined, "Na ementa lê-se “Harburguer simples”: nome corrigido (confirmar)."),
  I("fast-food", "Hamburguer Nô Kau", 3000), I("fast-food", "Shawarma Simples", 1500), I("fast-food", "Shawarma Nô Kau", 2000),
  I("fast-food", "Fataya Simples", 1000), I("fast-food", "Fataya Completo", 1500), I("fast-food", "Tacos", 2500),
  // ----- PIZZAS (Média / Grande) -----
  I("pizzas", "Pizza de Frango (Média)", 5000), I("pizzas", "Pizza de Frango (Grande)", 7500),
  I("pizzas", "Pizza de Atum (Média)", 5000), I("pizzas", "Pizza de Atum (Grande)", 7500),
  I("pizzas", "Pizza de Carne Moída (Média)", 5000, undefined, "Na ementa lê-se “Carne Muida”: corrigido (confirmar)."), I("pizzas", "Pizza de Carne Moída (Grande)", 7500, undefined, "Na ementa lê-se “Carne Muida”: corrigido (confirmar)."),
  I("pizzas", "Pizza Vegetariana (Média)", 5000), I("pizzas", "Pizza Vegetariana (Grande)", 7500),
  I("pizzas", "Pizza Margarita (Média)", 5000), I("pizzas", "Pizza Margarita (Grande)", 7500),
  I("pizzas", "Pizza 4 Estações (Média)", 6500), I("pizzas", "Pizza 4 Estações (Grande)", 9000),
  // ----- OUTROS -----
  I("outros", "Omelete Simples no Prato", 2000), I("outros", "Omelete Mista no Prato", 3000), I("outros", "Omelete de Frango", 3000),
  I("outros", "Omelete de Atum", 3000), I("outros", "Omelete de Linguiça", 3000), I("outros", "Ovo Extra", 500), I("outros", "Batata Frita", 1000),
  // ----- REFRIGERANTES & SUMOS -----
  I("refrigerantes-sumos", "Sumo Natural", 800), I("refrigerantes-sumos", "Maaza", 700), I("refrigerantes-sumos", "Sumol", 700),
  I("refrigerantes-sumos", "Fanta", 700), I("refrigerantes-sumos", "Sprite", 700), I("refrigerantes-sumos", "Coca-Cola", 700),
  I("refrigerantes-sumos", "Compal", 700), I("refrigerantes-sumos", "Red Bull", 2000),
  // ----- ÁGUAS -----
  I("aguas", "Água Mineral Pequena", 500, undefined, "Na ementa de sandes aparece “Água Pequena” a 500: unida a este produto (confirmar)."),
  I("aguas", "Água Mineral Grande", 1000, undefined, "Na ementa de sandes aparece “Água 1,5 L” a 1.000: unida a este produto (confirmar o tamanho)."),
  I("aguas", "Água das Pedras", 1000), I("aguas", "Castelo", 1000), I("aguas", "Água Tónica", 1000),
  // ----- CAFÉ & CHÁ -----
  I("cafe-cha", "Café", 500), I("cafe-cha", "Chá", 1000),
  // ----- CERVEJAS & CIDRAS -----
  I("cervejas-cidras", "Super Bock Mini", 500), I("cervejas-cidras", "Super Bock Preta Mini", 1000), I("cervejas-cidras", "Super Bock Preta", 1500),
  I("cervejas-cidras", "Cristal Mini", 500), I("cervejas-cidras", "Cristal Lata", 1500), I("cervejas-cidras", "Sagres", 500),
  I("cervejas-cidras", "Guinness", 2000, undefined, "Na ementa lê-se “Guiness”: corrigido (confirmar)."), I("cervejas-cidras", "Heineken", 1000, undefined, "Na ementa lê-se “Heiniken”: corrigido (confirmar)."),
  I("cervejas-cidras", "Somersby Mini", 1000), I("cervejas-cidras", "Somersby XL", 1500),
  // ----- WHISKIES (Bolha / Garrafa) -----
  ...BG("whiskies", "Jack Daniel's", 4000, 40000), ...BG("whiskies", "Chivas", 4000, 45000), ...BG("whiskies", "Chivas Regal", null, 60000),
  ...BG("whiskies", "Jim Beam", null, 30000), ...BG("whiskies", "Jameson", 3000, 30000),
  ...BG("whiskies", "John Walker White", null, 40000, "Na ementa lê-se “Whalker”: corrigido (confirmar)."),
  ...BG("whiskies", "John Walker Black", 4000, 50000, "Na ementa lê-se “Whalker”: corrigido (confirmar)."),
  ...BG("whiskies", "John Walker Red", 3000, 30000, "Na ementa lê-se “Whalker”: corrigido (confirmar)."),
  ...BG("whiskies", "Ballantines", 4000, 30000), ...BG("whiskies", "Logan", 3000, 30000), ...BG("whiskies", "JB", 3000, 20000),
  ...BG("whiskies", "Grants", 3000, 20000), ...BG("whiskies", "The Famous Grouse", 3000, 25000),
  // ----- VODKAS & TEQUILA -----
  ...BG("vodkas-tequila", "Ciroc Azul", null, 45000), ...BG("vodkas-tequila", "Ciros Summer", null, 45000, "Na ementa lê-se “Ciros Summer”: confirmar o nome (Ciroc Summer?)."),
  ...BG("vodkas-tequila", "Absolut", 3500, 30000), ...BG("vodkas-tequila", "Roberto Cavalli Vodka", null, 40000), ...BG("vodkas-tequila", "El Mariachi", 2500, 30000),
  // ----- GINS -----
  ...BG("gins", "Bombay", 3000, 30000), ...BG("gins", "Tanqueray", 3000, 30000), ...BG("gins", "Gin Gordon Branco", 3000, 25000), ...BG("gins", "Gin Gordon Rose", 3000, 25000),
  // ----- VERMUTE -----
  ...BG("vermute", "Martini Bianco", 3000, 20000, "Na ementa existem “Martini Bianco” e “Martini Branco”: confirmar se são dois produtos."),
  ...BG("vermute", "Martini Branco", 3000, 20000, "Na ementa existem “Martini Bianco” e “Martini Branco”: confirmar se são dois produtos."),
  ...BG("vermute", "Martini Tinto", 3000, 20000), ...BG("vermute", "Martini Rose", 3000, 20000), ...BG("vermute", "Martini Fiero", 3000, 20000),
  // ----- RUNS, LICORES & FRIZANTES -----
  ...BG("runs-licores-frizantes", "Bacardi", null, 25000), ...BG("runs-licores-frizantes", "Malibu", null, 30000), ...BG("runs-licores-frizantes", "Baileys", 3000, 35000),
  ...BG("runs-licores-frizantes", "Amarula", null, 25000), ...BG("runs-licores-frizantes", "Carolans", null, 25000), ...BG("runs-licores-frizantes", "Gold Strike", null, 25000),
  ...BG("runs-licores-frizantes", "Licor Safari", null, 24000),
  ...BG("runs-licores-frizantes", "Hugo", null, 6000, "O preço está na coluna “Garrafa” mas é muito baixo para uma garrafa: confirmar se é por copo."),
  ...BG("runs-licores-frizantes", "Hugo Graciosa", null, 10000, "O preço está na coluna “Garrafa”: confirmar se é por garrafa ou por copo."),
  // ----- VINHOS & CHAMPAGNE (preço único) — VV verde · VT tinto · VB branco -----
  I("vinhos-champagne", "Casal Garcia", 10000, "Vinho verde"), I("vinhos-champagne", "Casal Garcia Sweet", 7000, "Vinho verde"),
  I("vinhos-champagne", "Gazela", 7500, "Vinho verde"), I("vinhos-champagne", "Lagosta", 10000, "Vinho verde"),
  I("vinhos-champagne", "Sangria", 10000, "Tinto ou branco"),
  I("vinhos-champagne", "Faisão", 5000, undefined, "Por baixo de “Faisão” há um segundo preço, 7.500, sem nome: confirmar a que produto pertence."),
  I("vinhos-champagne", "JP (375 ml)", 5000, "Vinho tinto"), I("vinhos-champagne", "JP (750 ml)", 10000, "Vinho tinto"),
  I("vinhos-champagne", "Adega de Borba Alforge", 7500, "Vinho tinto"), I("vinhos-champagne", "Mundus", 10000, "Vinho tinto"),
  I("vinhos-champagne", "Marques de Borba", 10000, "Vinho tinto"), I("vinhos-champagne", "Comenda Grande", 12000, "Vinho tinto"),
  I("vinhos-champagne", "Quinta Cabriz Tinto", 12000, "Vinho tinto"),
  I("vinhos-champagne", "Casa de Santar (750 ml)", 12000, "Vinho tinto"), I("vinhos-champagne", "Casa de Santar (375 ml)", 7000, "Vinho tinto"),
  I("vinhos-champagne", "Casa de Santar Reserva", 22000, "Vinho tinto"), I("vinhos-champagne", "Papa Figos", 10000, "Vinho tinto"),
  I("vinhos-champagne", "Quinta Cabriz Branco (750 ml)", 12000, "Vinho branco"), I("vinhos-champagne", "Quinta Cabriz Branco (375 ml)", 7000, "Vinho branco"),
  I("vinhos-champagne", "Gato Azul", 10000, "Vinho branco"),
  I("vinhos-champagne", "Cacho Fresco (Espumante)", 15000, undefined, "Na ementa lê-se “Espomante”: corrigido (confirmar)."), I("vinhos-champagne", "Bar Royal", 10000),
];

/**
 * Fotografias ILUSTRATIVAS geradas por IA (Higgsfield, Nano Banana 2) — não são os pratos reais do Nô Kau.
 * Ficheiros em public/menu/ilustrativas; o menu mostra-as com a etiqueta “Imagem ilustrativa”.
 * A importação só as liga a produtos que ainda não tenham fotografia (nunca substitui uma foto real).
 */
const ILUSTRATIVAS: Record<string, string> = {
  "Frango Churrasco": "frango-churrasco",
  "Camarão Tigre / Gambas": "camarao-tigre",
  "Espetada Bijagós": "espetada-bijagos",
  "Bica (500 g)": "peixe-grelhado",
  "Bica (1 kg)": "peixe-grelhado",
  "Bife Nô Kau": "bife-nokau",
  "Salada Noçoise": "salada-nicoise",
  // Vinhos — fotografias recebidas a 27/11/2026 (originais em pratos/recebidas-2026-11-27/, inventário em
  // docs/catalogo-imagens-inventario.md). Os rótulos têm texto deformado típico de imagem gerada: são ILUSTRATIVAS.
  // Só associações confirmadas (marca, linha, tamanho e cor do vinho iguais ao produto da ementa).
  "Casa de Santar (750 ml)": "vinhos-champagne/casa-de-santar-750ml",
  "Casa de Santar Reserva": "vinhos-champagne/casa-de-santar-reserva",
  "Quinta Cabriz Tinto": "vinhos-champagne/quinta-cabriz-tinto",
  // 2.º envio (27/11/2026, foto-6/8/10): associações confirmadas no inventário (IMG-006, IMG-008, IMG-010).
  "Papa Figos": "vinhos-champagne/papa-figos",
  "Cacho Fresco (Espumante)": "vinhos-champagne/cacho-fresco",
  "Salada de Frango": "salada-de-frango",
  // 3.º envio (27/11/2026, foto-11/12/14/15): IMG-011, IMG-012 e IMG-014/015 (acompanhamentos diferentes aprovados pelo dono).
  "Salada de Tomate": "salada-de-tomate",
  "Tábua de Queijo, Enchidos e Azeitonas": "tabua-queijo-enchidos",
  "Filete Marinheiro": "filete-marinheiro",
  "Espetada de Frango": "espetada-de-frango",
  // 4.º envio (27/11/2026, foto-16/17/18): IMG-016 (acompanhamentos diferentes aprovados pelo dono), IMG-017, IMG-018.
  "Cordon Bleu": "cordon-bleu",
  "Omelete Simples no Prato": "omelete-simples-prato",
  "Omelete de Atum": "omelete-de-atum",
  // Decisões delegadas pelo dono (27/11/2026): uma foto por produto, nunca a mesma em dois produtos.
  "Gato Azul": "vinhos-champagne/gato-azul",
  "Simpote": "simpote",
  "Shawarma Simples": "shawarma-simples",
  "Fataya Completo": "fataya-completo",
  // 5.º envio (28/11/2026, pasta «prato 2», 111 ficheiros): fotografias de embalagem das marcas, enviadas pelo dono.
  // Só associações confirmadas (marca e produto iguais à ementa); inventário completo em docs/catalogo-imagens-prato2.md.
  // Bolha/Garrafa: só a Garrafa recebe a foto (regra do dono: nunca a mesma fotografia em dois produtos).
  "The Famous Grouse (Garrafa)": "whiskies/the-famous-grouse", // P001
  "Marques de Borba": "vinhos-champagne/marques-de-borba", // P003
  "Carolans (Garrafa)": "runs-licores-frizantes/carolans", // P010
  "Gazela": "vinhos-champagne/gazela", // P011
  "Água Tónica": "aguas/agua-tonica", // P014
  "Lagosta": "vinhos-champagne/lagosta", // P017
  "Guinness": "cervejas-cidras/guinness", // P019
  "Super Bock Preta Mini": "cervejas-cidras/super-bock-preta-mini", // P020
  "Água das Pedras": "aguas/agua-das-pedras", // P021
  "Jameson (Garrafa)": "whiskies/jameson", // P022
  "Grants (Garrafa)": "whiskies/grants", // P024
  "Adega de Borba Alforge": "vinhos-champagne/alforge", // P025
  "Casal Garcia Sweet": "vinhos-champagne/casal-garcia-sweet", // P027
  "Somersby Mini": "cervejas-cidras/somersby-mini", // P029
  "Roberto Cavalli Vodka (Garrafa)": "vodkas-tequila/roberto-cavalli", // P031
  "Compal": "refrigerantes-sumos/compal", // P032
  "Cristal Lata": "cervejas-cidras/cristal-lata", // P034
  "Gin Gordon Branco (Garrafa)": "gins/gordon-branco", // P035
  "John Walker White (Garrafa)": "whiskies/john-walker-white", // P036
  "Tanqueray (Garrafa)": "gins/tanqueray", // P037
  "Bar Royal": "vinhos-champagne/bar-royal", // P042
  "Martini Rose (Garrafa)": "vermute/martini-rose", // P043
  "Castelo": "aguas/castelo", // P044
  "Jim Beam (Garrafa)": "whiskies/jim-beam", // P045
  "Ciroc Azul (Garrafa)": "vodkas-tequila/ciroc-azul", // P046
  "Casal Garcia": "vinhos-champagne/casal-garcia", // P047
  "Mundus": "vinhos-champagne/mundus", // P049
  "Martini Bianco (Garrafa)": "vermute/martini-bianco", // P051
  "Gin Gordon Rose (Garrafa)": "gins/gordon-rose", // P052
  "Ballantines (Garrafa)": "whiskies/ballantines", // P053
  "JB (Garrafa)": "whiskies/jb", // P101
  "Super Bock Mini": "cervejas-cidras/super-bock-mini", // P108
  "Martini Fiero (Garrafa)": "vermute/martini-fiero", // P110
  "John Walker Red (Garrafa)": "whiskies/john-walker-red", // P111
};
for (const it of CATALOG_ITEMS) {
  const f = ILUSTRATIVAS[it.name];
  if (f) it.image = `${ILLUSTRATIVE_DIR}${f}.webp`;
}
