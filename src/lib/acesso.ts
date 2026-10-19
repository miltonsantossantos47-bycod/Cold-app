// Códigos de acesso e limite diário. Tudo vem de variáveis de ambiente (.env.local / Vercel).
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

export function tipoDoCodigo(c: unknown): TipoCodigo | null {
  const codigo = normalizarCodigo(c);
  if (!codigo) return null;
  if (lista(process.env.CODIGOS_ILIMITADOS).includes(codigo)) return "ilimitado";
  if (lista(process.env.CODIGOS_ACESSO).includes(codigo)) return "normal";
  return null;
}

export function haCodigosConfigurados(): boolean {
  return lista(process.env.CODIGOS_ILIMITADOS).length + lista(process.env.CODIGOS_ACESSO).length > 0;
}

export function limiteDiario(): number {
  const n = parseInt(process.env.LIMITE_DIARIO ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

// "Hoje" em Luanda (UTC+1, sem hora de verão), no formato AAAA-MM-DD.
export function hojeEmLuanda(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function diaEmLuandaHaDias(dias: number): string {
  return new Date(Date.now() + 60 * 60 * 1000 - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
