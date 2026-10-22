export type Category = "Abstract" | "Botanical" | "Landscape";
export type Product = {
  id: string;
  name: string;
  artist: string;
  category: Category;
  price: number;
  background: string;
  palette: [string, string, string];
  description: string;
};

export const products: Product[] = [
  {
    id: "sunroom",
    name: "Sunroom",
    artist: "Tomi Ade",
    category: "Abstract",
    price: 45,
    background: "#e5dbc7",
    palette: ["#bc552e", "#eab64b", "#344b3d"],
    description:
      "A little warmth, even on the cloudy days. Playful shapes meet sun-washed colour in this geometric study.",
  },
  {
    id: "slow-morning",
    name: "Slow Morning",
    artist: "Ada Okoro",
    category: "Botanical",
    price: 35,
    background: "#e3e6d9",
    palette: ["#3e553b", "#a3ad72", "#bc744d"],
    description:
      "An unhurried study of leaves and light. A soft green companion for your favourite quiet corner.",
  },
  {
    id: "somewhere-soft",
    name: "Somewhere Soft",
    artist: "Tomi Ade",
    category: "Landscape",
    price: 50,
    background: "#e9dacb",
    palette: ["#bc795f", "#837d59", "#d9b572"],
    description:
      "Rolling hills, a distant sun, and room to breathe. A dreamy landscape in earthy, easy-going tones.",
  },
  {
    id: "good-company",
    name: "Good Company",
    artist: "Nneka Eze",
    category: "Abstract",
    price: 40,
    background: "#e4d8bd",
    palette: ["#364c8a", "#cd6b42", "#dfb84c"],
    description:
      "A conversation between colour and form. Bold, friendly shapes that feel right at home together.",
  },
  {
    id: "wild-stems",
    name: "Wild Stems",
    artist: "Ada Okoro",
    category: "Botanical",
    price: 30,
    background: "#e7d7c5",
    palette: ["#57634a", "#bf775b", "#c3a05b"],
    description:
      "A handful of wild stems, gathered just because. Organic lines bring a little of the outdoors inside.",
  },
  {
    id: "blue-hour",
    name: "Blue Hour",
    artist: "Femi Cole",
    category: "Landscape",
    price: 45,
    background: "#dae0e2",
    palette: ["#4c667a", "#7e9396", "#d6b896"],
    description:
      "That fleeting moment between afternoon and evening, captured in gentle layers of blue.",
  },
  {
    id: "a-little-balance",
    name: "A Little Balance",
    artist: "Nneka Eze",
    category: "Abstract",
    price: 35,
    background: "#e6dcd0",
    palette: ["#ab4c3b", "#4c5446", "#c9a563"],
    description:
      "An imperfect balancing act. Sculptural shapes and warm neutrals make a quietly confident pair.",
  },
  {
    id: "olive-grove",
    name: "Olive Grove",
    artist: "Ada Okoro",
    category: "Botanical",
    price: 50,
    background: "#dedfc9",
    palette: ["#4c5b36", "#8c9561", "#b28b60"],
    description:
      "Branching forms inspired by the olive tree. Earthy greens for a space that needs a softer touch.",
  },
  {
    id: "ochre-days",
    name: "Ochre Days",
    artist: "Femi Cole",
    category: "Landscape",
    price: 40,
    background: "#e9d9bb",
    palette: ["#b3773e", "#cc9c58", "#677252"],
    description:
      "A golden sun over open country. A small reminder to slow down and take the scenic route.",
  },
  {
    id: "in-good-shape",
    name: "In Good Shape",
    artist: "Tomi Ade",
    category: "Abstract",
    price: 30,
    background: "#e4d7cd",
    palette: ["#3f625b", "#c77553", "#d2ad58"],
    description:
      "Curves, corners, and a happy bit of colour. An expressive print with a playful point of view.",
  },
];

export const formatPrice = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
export type CartItem = { productId: string; quantity: number };
export const MAX_QUANTITY = 10;

export function normalizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const cart: CartItem[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.productId !== "string" ||
      !products.some((product) => product.id === item.productId) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    )
      continue;
    const existing = cart.find((line) => line.productId === item.productId);
    if (existing)
      existing.quantity = Math.min(
        MAX_QUANTITY,
        existing.quantity + item.quantity,
      );
    else
      cart.push({
        productId: item.productId,
        quantity: Math.min(MAX_QUANTITY, item.quantity),
      });
  }
  return cart;
}

export function cartTotal(cart: CartItem[]) {
  return normalizeCart(cart).reduce(
    (total, item) =>
      total +
      products.find((product) => product.id === item.productId)!.price *
        item.quantity,
    0,
  );
}
