// Códigos de acesso e limite diário. Tudo vem de variáveis de ambiente (.env.local / painel do Cloudflare).
export type TipoCodigo = "ilimitado" | "normal";

function lista(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

// Só letras, números, "-" e "_" (3 a 64 caracteres). Qualquer outra coisa é inválida.
export function normalizarCodigo(c: unknown): string {
  if (typeof c !== "string") return "";
  const n = c.trim().toUpperCase();
  return /^[A-Z0-9_-]{3,64}$/.test(n) ? n : "";
}

// CODIGOS_ACESSO aceita "CODIGO" (usa o LIMITE_DIARIO geral) ou "CODIGO:15" (limite próprio desse código).
function codigosNormais(): Map<string, number | null> {
  const mapa = new Map<string, number | null>();
  // Os códigos antigos (COLD-XXXXX) estão desligados. Só voltam a funcionar com CODIGOS_ANTIGOS_ATIVOS=sim.
  if ((process.env.CODIGOS_ANTIGOS_ATIVOS ?? "").trim().toLowerCase() !== "sim") return mapa;
  for (const item of lista(process.env.CODIGOS_ACESSO)) {
    const [cod, lim] = item.split(":");
    const n = lim !== undefined ? parseInt(lim, 10) : NaN;
    mapa.set(cod.trim(), Number.isFinite(n) && n > 0 ? n : null);
  }
  return mapa;
}

export function tipoDoCodigo(c: unknown): TipoCodigo | null {
  const codigo = normalizarCodigo(c);
  if (!codigo) return null;
  if (lista(process.env.CODIGOS_ILIMITADOS).includes(codigo)) return "ilimitado";
  if (codigosNormais().has(codigo)) return "normal";
  return null;
}

export function haCodigosConfigurados(): boolean {
  return lista(process.env.CODIGOS_ILIMITADOS).length + codigosNormais().size > 0;
}

// Limite do código (se tiver "CODIGO:N"); senão o LIMITE_DIARIO geral; senão 20.
export function limiteDiario(codigo?: unknown): number {
  const proprio = codigo ? codigosNormais().get(normalizarCodigo(codigo)) : null;
  if (proprio) return proprio;
  const n = parseInt(process.env.LIMITE_DIARIO ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

// "Hoje" em Luanda (UTC+1, sem hora de verão), no formato AAAA-MM-DD.
// Só para testes no teu computador: COLD_HOJE=AAAA-MM-DD finge que hoje é esse dia
// (serve para simular a passagem da meia-noite). Em produção é sempre ignorado.
export function hojeEmLuanda(): string {
  const fingido = process.env.COLD_HOJE?.trim();
  if (fingido && process.env.NODE_ENV !== "production" && /^\d{4}-\d{2}-\d{2}$/.test(fingido)) return fingido;
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function diaEmLuandaHaDias(dias: number): string {
  return new Date(Date.now() + 60 * 60 * 1000 - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Datas como texto AAAA-MM-DD (dias de Luanda).
export function somarDias(dia: string, n: number): string {
  const d = new Date(dia + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(ate + "T00:00:00Z") - Date.parse(de + "T00:00:00Z")) / 86400000);
}
