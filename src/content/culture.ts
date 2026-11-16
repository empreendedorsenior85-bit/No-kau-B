/**
 * Narrativa cultural. Factos com fonte; o resto é voz da marca (marcado como tal).
 * Estado: proposta — a validar com o proprietário (origem das peças da sala).
 */
export const sources = [
  {
    label: "University of Michigan Museum of Art — Mask (vaca bruto, dugn'be type)",
    href: "https://umma.umich.edu/objects/mask-vaca-bruto-dugnbe-type-1984-1-273",
  },
  { label: "Museum of Fine Arts, Boston — Cow mask (vaca bruto)", href: "https://mfaboston6.emuseum.com/objects/479286/cow-mask-vaca-bruto" },
  { label: "Mask Museum — Bidjogo Dugn'be", href: "https://www.maskmuseum.org/?p=3547" },
  {
    label: "IUCN — Novos sítios do Património Mundial (julho de 2025)",
    href: "https://iucn.org/press-release/202507/rainforests-reefs-new-world-heritage-sites-signal-conservation-breakthroughs",
  },
] as const;

export const chapters = [
  {
    n: "I",
    title: "Vaca bruto",
    kicker: "Mais do que um símbolo, uma memória que atravessa gerações.",
    body: [
      "No arquipélago dos Bijagós, o gado selvagem — vaca bruto, em kriol — ganha forma em máscaras de madeira pintada, com chifres, dançadas nas cerimónias de iniciação masculina, em festivais e em dias de festa nacional.",
      "O Museum of Fine Arts de Boston associa-as ao grupo etário cabaro — jovens entre os 17 e os 27 anos. Um dos tipos, o dugn'be, distingue-se pelo triângulo branco na testa — o mesmo que se vê nas peças que inspiram a nossa sala.",
    ],
  },
  {
    n: "II",
    title: "As ilhas",
    kicker: "Uma herança que o mundo reconheceu.",
    body: [
      "Em julho de 2025, os ecossistemas costeiros e marinhos do arquipélago dos Bijagós tornaram-se o primeiro Património Mundial da Guiné-Bissau. É a natureza que sustenta as comunidades onde estas tradições vivem.",
    ],
  },
  {
    n: "III",
    title: "A nossa sala",
    kicker: "No Nô Kau, a cultura não é decoração.",
    body: [
      "As paredes reúnem expressões de várias tradições da África Ocidental. No centro, as máscaras inspiradas na vaca bruto lembram-nos de onde vimos — e porque abrimos a mesa a quem chega.",
    ],
  },
  {
    n: "IV",
    title: "A voz",
    kicker: "Cada tradição guarda uma história. Cada história merece continuar viva.",
    body: [
      "O nosso símbolo é uma voz: alguém que canta de olhos fechados. À mesa, ao balcão ou ao microfone, o Nô Kau é um lugar para partilhar — sabores, memórias e canções.",
    ],
  },
] as const;
