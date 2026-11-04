// Planos do Cold: pacotes de trocas por dia. Muda os preços aqui (valores em kwanzas).
export type PlanoId = "teste" | "basico" | "estudante" | "intensivo" | "personalizado" | "piloto";

// ---------- Preços (em kwanzas) ----------
// Cada troca é vendida a PRECO_TROCA_KZ. Os planos fixos têm um desconto sobre o plano personalizado equivalente.
export const PRECO_TROCA_KZ = 60;
export const DESCONTO_PLANOS = 0.3; // 30%

// ---------- Limites dos pedidos (muda aqui) ----------
// Mínimo de trocas por dia no personalizado: uma aula completa (diagnóstico + explicação + exercícios) leva 4 a 6 trocas.
export const TROCAS_MIN_PERSONALIZADO = 5;
// Valor mínimo de qualquer pedido (em kwanzas).
export const VALOR_MINIMO_PEDIDO_KZ = 3000;

// Limites do plano personalizado
export const PERSONALIZADO = { trocasMin: TROCAS_MIN_PERSONALIZADO, trocasMax: 50, diasMin: 1, diasMax: 90 };

export function precoBase(trocasPorDia: number, dias: number): number {
  return trocasPorDia * dias * PRECO_TROCA_KZ;
}
export function precoComDesconto(trocasPorDia: number, dias: number): number {
  return Math.round(precoBase(trocasPorDia, dias) * (1 - DESCONTO_PLANOS));
}

// Valida o que a pessoa escolheu no plano personalizado. Usada na página (para desativar o botão)
// e no servidor (que nunca confia no navegador), com as mesmas mensagens.
export function validarPersonalizado(
  trocas: unknown,
  dias: unknown
): { ok: true; trocas: number; dias: number; preco: number } | { ok: false; erro: string } {
  const t = typeof trocas === "number" ? trocas : Number(trocas);
  const d = typeof dias === "number" ? dias : Number(dias);
  const p = PERSONALIZADO;
  if (
    !Number.isInteger(t) || !Number.isInteger(d) ||
    t < p.trocasMin || t > p.trocasMax || d < p.diasMin || d > p.diasMax
  ) {
    return { ok: false, erro: `Escolhe entre ${p.trocasMin} e ${p.trocasMax} trocas por dia, e entre ${p.diasMin} e ${p.diasMax} dias.` };
  }
  const preco = precoBase(t, d); // sem desconto
  if (preco < VALOR_MINIMO_PEDIDO_KZ) return { ok: false, erro: `O valor mínimo por pedido é ${formatarKz(VALOR_MINIMO_PEDIDO_KZ)}.` };
  return { ok: true, trocas: t, dias: d, preco };
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

// ---------- Trocas que passam para o dia seguinte ----------
// À meia-noite (Luanda), as trocas não usadas passam para o dia seguinte, até metade do limite diário
// (arredondado para baixo). Contam-se só contra o limite normal de ontem, por isso as trocas que vieram
// de anteontem não voltam a passar (não fazem bola de neve). O teste grátis e os acessos internos não têm.
export const PLANOS_COM_TRANSPORTE: PlanoId[] = ["basico", "estudante", "intensivo", "personalizado"];

export function trocasQuePassam(limiteDiario: number, usadasOntem: number): number {
  return Math.max(0, Math.min(Math.floor(limiteDiario / 2), limiteDiario - usadasOntem));
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
