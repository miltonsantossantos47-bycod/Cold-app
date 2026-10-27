// Contas com Google (Supabase Auth). O navegador envia o "token" da sessão; aqui confirmamos com a Supabase quem é.
export type Usuario = { id: string; email: string; nome: string };

const cache = new Map<string, { u: Usuario; ate: number }>();

function urlBase(): string {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
}

function chavePublica(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

// As contas só ficam ligadas quando as duas variáveis NEXT_PUBLIC_SUPABASE_* existem.
export function contasAtivas(): boolean {
  return urlBase() !== "" && chavePublica() !== "";
}

export function tokenDoPedido(req: Request): string | null {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

// null = token inválido ou expirado. Lança erro se a Supabase estiver em baixo (quem chama responde "não consegui verificar").
export async function verificarToken(token: string): Promise<Usuario | null> {
  const hit = cache.get(token);
  if (hit && hit.ate > Date.now()) return hit.u;
  const r = await fetch(`${urlBase()}/auth/v1/user`, {
    headers: { apikey: chavePublica(), Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error("Falha a verificar a sessão.");
  const d = (await r.json()) as { id?: string; email?: string; user_metadata?: Record<string, unknown> };
  if (!d?.id) return null;
  const meta = d.user_metadata ?? {};
  const nomeMeta = String(meta.full_name || meta.name || "").trim();
  const email = String(d.email ?? "");
  const u: Usuario = { id: String(d.id), email, nome: (nomeMeta || email.split("@")[0]).slice(0, 80) };
  if (cache.size > 500) cache.clear();
  cache.set(token, { u, ate: Date.now() + 60_000 });
  return u;
}
