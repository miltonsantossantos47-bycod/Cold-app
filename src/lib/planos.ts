// Planos do Cold: pacotes de trocas por dia. Muda os preços aqui (valores em kwanzas).
export type PlanoId = "teste" | "basico" | "estudante" | "intensivo" | "piloto";

export type Plano = {
  id: PlanoId;
  nome: string;
  trocasPorDia: number;
  primeiroDia?: number; // só o teste: trocas no 1.º dia
  precoKz: number;
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
    precoKz: 6900,
    dias: 30,
    publico: true,
    descricao: "6 trocas por dia, durante 30 dias.",
  },
  {
    id: "estudante",
    nome: "Estudante",
    trocasPorDia: 10,
    precoKz: 9900,
    dias: 30,
    publico: true,
    descricao: "10 trocas por dia, durante 30 dias.",
  },
  {
    // Fica fora da página pública até confirmares o preço (com 20 trocas por dia, o custo da IA pode passar do preço).
    id: "intensivo",
    nome: "Intensivo",
    trocasPorDia: 20,
    precoKz: 12500,
    dias: 30,
    publico: false,
    descricao: "20 trocas por dia, durante 30 dias.",
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
