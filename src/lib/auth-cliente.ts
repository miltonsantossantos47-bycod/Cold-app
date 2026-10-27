"use client";
// Entrar com Google (Supabase Auth). Só fica ativo se as duas variáveis NEXT_PUBLIC_SUPABASE_* existirem.
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const CONTAS_ATIVAS = Boolean(URL_SB && CHAVE_SB);

let cliente: SupabaseClient | null = null;

export function supabaseCliente(): SupabaseClient | null {
  if (!CONTAS_ATIVAS) return null;
  if (!cliente) {
    cliente = createClient(URL_SB as string, CHAVE_SB as string, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return cliente;
}

export type Conta = { userId: string; email: string; nome: string };

export function contaDaSessao(s: Session | null | undefined): Conta | null {
  if (!s?.user) return null;
  const meta = (s.user.user_metadata ?? {}) as Record<string, unknown>;
  const email = s.user.email ?? "";
  const nome = String(meta.full_name || meta.name || "").trim() || email.split("@")[0];
  return { userId: s.user.id, email, nome };
}

export async function sessaoAtual(): Promise<Session | null> {
  const c = supabaseCliente();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session;
}

// getSession() renova o token sozinho quando está a expirar.
export async function tokenAtual(): Promise<string | null> {
  return (await sessaoAtual())?.access_token ?? null;
}

export async function entrarComGoogle(): Promise<void> {
  const c = supabaseCliente();
  if (!c) throw new Error("As contas ainda não estão ligadas.");
  const { error } = await c.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/app` },
  });
  if (error) throw error;
}

export async function sairDaConta(): Promise<void> {
  const c = supabaseCliente();
  if (c) await c.auth.signOut();
}
