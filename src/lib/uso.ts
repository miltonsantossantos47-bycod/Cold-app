// Registo de uso por código e por dia.
// - Com SUPABASE_URL + SUPABASE_SECRET_KEY: guarda na Supabase (obrigatório em produção/Vercel).
//   (Também aceita o nome antigo SUPABASE_SERVICE_ROLE_KEY.)
// - Sem Supabase, no teu computador: guarda no ficheiro .data/uso.json.
import { promises as fs } from "fs";
import path from "path";

export type LinhaUso = {
  codigo: string;
  dia: string;
  trocas: number;
  tokens_in: number;
  tokens_out: number;
};

const FICHEIRO = path.join(process.cwd(), ".data", "uso.json");

function supabase(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

// Devolve uma mensagem de erro se não houver onde guardar o uso com segurança.
export function erroDeArmazenamento(): string | null {
  if (!supabase() && process.env.VERCEL) {
    return "Falta configurar a Supabase (SUPABASE_URL e SUPABASE_SECRET_KEY) para guardar o uso em produção.";
  }
  return null;
}

// As chaves novas da Supabase (sb_secret_...) vão só no cabeçalho "apikey".
// As chaves antigas (service_role, que começam por "eyJ") também vão em "Authorization".
function cabecalhos(key: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key, "content-type": "application/json" };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

async function lerFicheiro(): Promise<LinhaUso[]> {
  try {
    return JSON.parse(await fs.readFile(FICHEIRO, "utf8")) as LinhaUso[];
  } catch {
    return [];
  }
}

async function gravarFicheiro(linhas: LinhaUso[]) {
  await fs.mkdir(path.dirname(FICHEIRO), { recursive: true });
  await fs.writeFile(FICHEIRO, JSON.stringify(linhas, null, 2), "utf8");
}

export async function lerTrocasDoDia(codigo: string, dia: string): Promise<number> {
  const sb = supabase();
  if (sb) {
    const r = await fetch(
      `${sb.url}/rest/v1/uso_diario?codigo=eq.${encodeURIComponent(codigo)}&dia=eq.${dia}&select=trocas`,
      { headers: cabecalhos(sb.key), cache: "no-store" }
    );
    if (!r.ok) throw new Error("Erro a ler o uso na Supabase.");
    const rows = (await r.json()) as { trocas: number }[];
    return rows[0]?.trocas ?? 0;
  }
  const linhas = await lerFicheiro();
  return linhas.find((l) => l.codigo === codigo && l.dia === dia)?.trocas ?? 0;
}

export async function registarTroca(codigo: string, dia: string, tokensIn: number, tokensOut: number) {
  const sb = supabase();
  if (sb) {
    const r = await fetch(`${sb.url}/rest/v1/rpc/registar_uso`, {
      method: "POST",
      headers: cabecalhos(sb.key),
      body: JSON.stringify({ p_codigo: codigo, p_dia: dia, p_in: tokensIn, p_out: tokensOut }),
    });
    if (!r.ok) throw new Error("Erro a registar o uso na Supabase.");
    return;
  }
  const linhas = await lerFicheiro();
  const existente = linhas.find((l) => l.codigo === codigo && l.dia === dia);
  if (existente) {
    existente.trocas += 1;
    existente.tokens_in += tokensIn;
    existente.tokens_out += tokensOut;
  } else {
    linhas.push({ codigo, dia, trocas: 1, tokens_in: tokensIn, tokens_out: tokensOut });
  }
  await gravarFicheiro(linhas);
}

export async function listarUso(desdeDia: string): Promise<LinhaUso[]> {
  const sb = supabase();
  if (sb) {
    const r = await fetch(
      `${sb.url}/rest/v1/uso_diario?dia=gte.${desdeDia}&select=codigo,dia,trocas,tokens_in,tokens_out&order=dia.desc`,
      { headers: cabecalhos(sb.key), cache: "no-store" }
    );
    if (!r.ok) throw new Error("Erro a listar o uso na Supabase.");
    return (await r.json()) as LinhaUso[];
  }
  const linhas = await lerFicheiro();
  return linhas.filter((l) => l.dia >= desdeDia).sort((a, b) => (a.dia < b.dia ? 1 : -1));
}
