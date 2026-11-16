/**
 * MENU — estrutura real, conteúdo de DEMONSTRAÇÃO.
 * Nenhum prato, ingrediente ou preço abaixo foi fornecido pelo restaurante.
 * `demo: true` obriga a interface a mostrar o selo "Demonstração".
 * `price: null` → "Preço a confirmar". Na Fase 4 estes dados vêm do painel.
 */
export type MenuCategory = { id: string; label: string; description: string };
export type MenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  ingredients?: string[];
  price: number | null; // XOF, inteiro
  available: boolean | null; // null = não confirmado
  image?: string;
  demo: boolean;
};

export const categories: MenuCategory[] = [
  { id: "entradas", label: "Entradas", description: "Para começar a noite." },
  { id: "principais", label: "Pratos principais", description: "Da grelha e da cozinha." },
  { id: "casa", label: "Especialidades da casa", description: "O que nos define." },
  { id: "tradicionais", label: "Especialidades tradicionais", description: "A mesa guineense." },
  { id: "acompanhamentos", label: "Acompanhamentos", description: "Para partilhar." },
  { id: "sobremesas", label: "Sobremesas", description: "Um final doce." },
  { id: "bebidas", label: "Bebidas & cocktails", description: "Do bar do Nô Kau." },
];

const demo = (category: string, n: number): MenuItem => ({
  id: `${category}-demo-${n}`,
  category,
  name: `Exemplo ${n} — ${categories.find((c) => c.id === category)!.label.toLowerCase()}`,
  description: "Nome, descrição, ingredientes e fotografia a fornecer pelo restaurante.",
  price: null,
  available: null,
  demo: true,
});

export const items: MenuItem[] = categories.flatMap((c) => [demo(c.id, 1), demo(c.id, 2)]);

export const menuIsDemo = items.every((i) => i.demo);
