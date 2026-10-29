// Pedidos de plano: a pessoa escolhe o plano na página /pagar, recebe uma referência, paga por Express
// e tu confirmas no painel. Assim sabes sempre QUEM pediu O QUÊ (incluindo planos personalizados).
import { randomInt } from "crypto";
import { cabecalhos, supabase } from "./uso";

export type Pedido = {
  ref: string;
  user_id: string;
  email: string;
  nome: string;
  tipo: string; // basico | estudante | intensivo | personalizado
  trocas_dia: number;
  dias: number;
  preco_kz: number;
  quando: "agora" | "depois";
  estado: "pendente" | "confirmado" | "cancelado";
  codigo?: string | null;
  criado_em?: string;
  confirmado_em?: string | null;
};

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function gerarRef(): string {
  let c = "PED-";
  for (let i = 0; i < 5; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return c;
}

function cfg() {
  const sb = supabase();
  if (!sb) throw new Error("Falta configurar a Supabase.");
  return sb;
}
const enc = encodeURIComponent;

async function ler(query: string): Promise<Pedido[]> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/pedidos?${query}`, { headers: cabecalhos(sb.key), cache: "no-store" });
  if (!r.ok) throw new Error("Erro a ler os pedidos (já correste o supabase.sql?).");
  return (await r.json()) as Pedido[];
}

export const listarPedidosDoUsuario = (userId: string) =>
  ler(`user_id=eq.${enc(userId)}&select=*&order=criado_em.desc&limit=20`);
export const listarPedidosPendentes = () => ler("estado=eq.pendente&select=*&order=criado_em.asc&limit=200");
export const listarPedidosRecentes = () => ler("estado=neq.pendente&select=*&order=criado_em.desc&limit=20");
export async function obterPedido(ref: string): Promise<Pedido | null> {
  return (await ler(`ref=eq.${enc(ref)}&select=*`))[0] ?? null;
}

// false se a referência já existir
export async function criarPedido(p: Pedido): Promise<boolean> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/pedidos`, {
    method: "POST",
    headers: { ...cabecalhos(sb.key), Prefer: "return=minimal" },
    body: JSON.stringify(p),
  });
  if (r.status === 409) return false;
  if (!r.ok) throw new Error("Erro a criar o pedido na Supabase.");
  return true;
}

export async function atualizarPedido(ref: string, patch: Partial<Pedido>): Promise<void> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/pedidos?ref=eq.${enc(ref)}`, {
    method: "PATCH",
    headers: { ...cabecalhos(sb.key), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("Erro a atualizar o pedido na Supabase.");
}
