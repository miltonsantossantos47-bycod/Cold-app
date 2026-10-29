// Planos do Cold: pacotes de trocas por dia. Muda os preços aqui (valores em kwanzas).
export type PlanoId = "teste" | "basico" | "estudante" | "intensivo" | "personalizado" | "piloto";

// ---------- Preços (em kwanzas) ----------
// Cada troca é vendida a PRECO_TROCA_KZ. Os planos fixos têm um desconto sobre o plano personalizado equivalente.
export const PRECO_TROCA_KZ = 60;
export const DESCONTO_PLANOS = 0.3; // 30%

// Limites do plano personalizado
export const PERSONALIZADO = { trocasMin: 1, trocasMax: 50, diasMin: 1, diasMax: 90 };

export function precoBase(trocasPorDia: number, dias: number): number {
  return trocasPorDia * dias * PRECO_TROCA_KZ;
}
export function precoComDesconto(trocasPorDia: number, dias: number): number {
  return Math.round(precoBase(trocasPorDia, dias) * (1 - DESCONTO_PLANOS));
}

// Valida o que a pessoa escolheu no plano personalizado (nunca confiar no navegador).
export function validarPersonalizado(trocas: unknown, dias: unknown): { trocas: number; dias: number } | null {
  const t = typeof trocas === "number" ? trocas : Number(trocas);
  const d = typeof dias === "number" ? dias : Number(dias);
  if (!Number.isInteger(t) || !Number.isInteger(d)) return null;
  if (t < PERSONALIZADO.trocasMin || t > PERSONALIZADO.trocasMax) return null;
  if (d < PERSONALIZADO.diasMin || d > PERSONALIZADO.diasMax) return null;
  return { trocas: t, dias: d };
}

export type Plano = {
  id: PlanoId;
  nome: string;
  trocasPorDia: number;
  primeiroDia?: number; // só o teste: trocas no 1.º dia
  precoKz: number; // o que a pessoa paga
  precoOriginalKz?: number; // o que custaria no plano personalizado (para mostrar o desconto)
  dias: number;
  publico: boolean; // aparece na página /pagar
  criavel?: boolean; // false = não aparece no painel para criar (plano interno)
  descricao: string;
};

export const PLANOS: Plano[] = [
  {
    id: "teste",
    nome: "Teste grátis",
    trocasPorDia: 4,
    primeiroDia: 8,
    precoKz: 0,
    dias: 7,
    publico: true,
    descricao: "7 dias para experimentar: 8 trocas no 1.º dia e 4 nos seguintes.",
  },
  {
    id: "basico",
    nome: "Básico",
    trocasPorDia: 6,
    precoKz: precoComDesconto(6, 30),
    precoOriginalKz: precoBase(6, 30),
    dias: 30,
    publico: true,
    descricao: "6 trocas por dia, durante 30 dias.",
  },
  {
    id: "estudante",
    nome: "Estudante",
    trocasPorDia: 10,
    precoKz: precoComDesconto(10, 30),
    precoOriginalKz: precoBase(10, 30),
    dias: 30,
    publico: true,
    descricao: "10 trocas por dia, durante 30 dias.",
  },
  {
    id: "intensivo",
    nome: "Intensivo",
    trocasPorDia: 20,
    precoKz: precoComDesconto(20, 30),
    precoOriginalKz: precoBase(20, 30),
    dias: 30,
    publico: true,
    descricao: "20 trocas por dia, durante 30 dias.",
  },
  {
    // O plano que cada pessoa monta (trocas por dia x dias); o limite fica guardado no próprio acesso.
    id: "personalizado",
    nome: "Personalizado",
    trocasPorDia: 0,
    precoKz: 0,
    dias: 0,
    publico: false,
    criavel: false,
    descricao: "Plano montado pela própria pessoa.",
  },
  {
    // Códigos do piloto ligados a uma conta: sem validade; o limite diário vem do próprio código.
    id: "piloto",
    nome: "Piloto",
    trocasPorDia: 10,
    precoKz: 0,
    dias: 0,
    publico: false,
    criavel: false,
    descricao: "Acesso do piloto.",
  },
];

export function planoPorId(id: unknown): Plano | null {
  return PLANOS.find((p) => p.id === id) ?? null;
}

// Limite do dia: um limite próprio do código manda; senão o do plano (o teste dá mais trocas no 1.º dia).
export function limiteDoPlano(plano: Plano, limiteProprio: number | null | undefined, inicio: string | null | undefined, hoje: string): number {
  if (limiteProprio && limiteProprio > 0) return limiteProprio;
  if (plano.primeiroDia && inicio && inicio === hoje) return plano.primeiroDia;
  return plano.trocasPorDia;
}

export function formatarKz(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " Kz";
}

export function formatarData(dia: string | null | undefined): string {
  if (!dia) return "";
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}
