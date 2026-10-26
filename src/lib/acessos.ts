// Assinaturas guardadas na Supabase (tabelas "acessos" e "pagamentos"; ver supabase.sql).
import { randomInt } from "crypto";
import { cabecalhos, supabase } from "./uso";

export type Acesso = {
  codigo: string;
  nome: string;
  contacto: string;
  plano: string;
  limite_diario: number | null;
  inicio: string | null;
  valido_ate: string | null;
  ativo: boolean;
  notas: string;
  criado_em?: string;
};

export type Pagamento = {
  id?: number;
  codigo: string;
  plano: string;
  valor_kz: number;
  dias: number;
  criado_em?: string;
};

export function temSupabase(): boolean {
  return supabase() !== null;
}

function cfg() {
  const sb = supabase();
  if (!sb) throw new Error("Falta configurar a Supabase (SUPABASE_URL e SUPABASE_SECRET_KEY).");
  return sb;
}

const enc = encodeURIComponent;

export async function obterAcesso(codigo: string): Promise<Acesso | null> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/acessos?codigo=eq.${enc(codigo)}&select=*`, {
    headers: cabecalhos(sb.key),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Erro a ler o acesso na Supabase.");
  const rows = (await r.json()) as Acesso[];
  return rows[0] ?? null;
}

export async function listarAcessos(): Promise<Acesso[]> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/acessos?select=*&order=criado_em.desc`, {
    headers: cabecalhos(sb.key),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Erro a listar os acessos na Supabase (já correste o supabase.sql?).");
  return (await r.json()) as Acesso[];
}

// Devolve false se o código já existir.
export async function criarAcesso(a: Acesso): Promise<boolean> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/acessos`, {
    method: "POST",
    headers: { ...cabecalhos(sb.key), Prefer: "return=minimal" },
    body: JSON.stringify(a),
  });
  if (r.status === 409) return false;
  if (!r.ok) throw new Error("Erro a criar o acesso na Supabase.");
  return true;
}

export async function atualizarAcesso(codigo: string, patch: Partial<Acesso>): Promise<void> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/acessos?codigo=eq.${enc(codigo)}`, {
    method: "PATCH",
    headers: { ...cabecalhos(sb.key), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("Erro a atualizar o acesso na Supabase.");
}

export async function registarPagamento(p: Pagamento): Promise<void> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/pagamentos`, {
    method: "POST",
    headers: { ...cabecalhos(sb.key), Prefer: "return=minimal" },
    body: JSON.stringify(p),
  });
  if (!r.ok) throw new Error("Erro a registar o pagamento na Supabase.");
}

export async function listarPagamentos(): Promise<Pagamento[]> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/pagamentos?select=*&order=criado_em.desc`, {
    headers: cabecalhos(sb.key),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Erro a listar os pagamentos na Supabase.");
  return (await r.json()) as Pagamento[];
}

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I/L (evita erros ao copiar)

export function gerarCodigo(): string {
  let c = "COLD-";
  for (let i = 0; i < 5; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return c;
}

// Quantos testes grátis automáticos (feitos pelas próprias pessoas) foram criados hoje (hora de Luanda).
export async function contarTestesAutoHoje(hoje: string): Promise<number> {
  const sb = cfg();
  const desde = encodeURIComponent(`${hoje}T00:00:00+01:00`);
  const r = await fetch(
    `${sb.url}/rest/v1/acessos?plano=eq.teste&notas=eq.auto-teste&criado_em=gte.${desde}&select=codigo`,
    { headers: cabecalhos(sb.key), cache: "no-store" }
  );
  if (!r.ok) throw new Error("Erro a contar os testes na Supabase.");
  return ((await r.json()) as unknown[]).length;
}

export async function existeContacto(contacto: string): Promise<boolean> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/acessos?contacto=eq.${enc(contacto)}&select=codigo&limit=1`, {
    headers: cabecalhos(sb.key),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Erro a verificar o contacto na Supabase.");
  return ((await r.json()) as unknown[]).length > 0;
}
