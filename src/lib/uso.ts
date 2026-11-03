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
  cache_escrita_5m: number;
  cache_escrita_1h: number;
  cache_leitura: number;
};

// Tokens gastos numa troca. "entrada" são só os que NÃO vieram da cache.
export type UsoTokens = {
  entrada: number;
  saida: number;
  escrita5m: number;
  escrita1h: number;
  leitura: number;
};

const FICHEIRO = path.join(process.cwd(), ".data", "uso.json");

export function supabase(): { url: string; key: string } | null {
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
export function cabecalhos(key: string): Record<string, string> {
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

export async function registarTroca(codigo: string, dia: string, uso: UsoTokens) {
  const sb = supabase();
  if (sb) {
    const r = await fetch(`${sb.url}/rest/v1/rpc/registar_uso_cache`, {
      method: "POST",
      headers: cabecalhos(sb.key),
      body: JSON.stringify({
        p_codigo: codigo,
        p_dia: dia,
        p_in: uso.entrada,
        p_out: uso.saida,
        p_escrita_5m: uso.escrita5m,
        p_escrita_1h: uso.escrita1h,
        p_leitura: uso.leitura,
      }),
    });
    if (!r.ok) throw new Error("Erro a registar o uso na Supabase.");
    return;
  }
  const linhas = await lerFicheiro();
  let l = linhas.find((x) => x.codigo === codigo && x.dia === dia);
  if (!l) {
    l = {
      codigo,
      dia,
      trocas: 0,
      tokens_in: 0,
      tokens_out: 0,
      cache_escrita_5m: 0,
      cache_escrita_1h: 0,
      cache_leitura: 0,
    };
    linhas.push(l);
  }
  l.trocas += 1;
  l.tokens_in += uso.entrada;
  l.tokens_out += uso.saida;
  l.cache_escrita_5m = (l.cache_escrita_5m ?? 0) + uso.escrita5m;
  l.cache_escrita_1h = (l.cache_escrita_1h ?? 0) + uso.escrita1h;
  l.cache_leitura = (l.cache_leitura ?? 0) + uso.leitura;
  await gravarFicheiro(linhas);
}

export async function listarUso(desdeDia: string): Promise<LinhaUso[]> {
  const sb = supabase();
  if (sb) {
    const r = await fetch(
      `${sb.url}/rest/v1/uso_diario?dia=gte.${desdeDia}&select=codigo,dia,trocas,tokens_in,tokens_out,cache_escrita_5m,cache_escrita_1h,cache_leitura&order=dia.desc`,
      { headers: cabecalhos(sb.key), cache: "no-store" }
    );
    if (!r.ok) throw new Error("Erro a listar o uso na Supabase.");
    return (await r.json()) as LinhaUso[];
  }
  const linhas = await lerFicheiro();
  return linhas
    .filter((l) => l.dia >= desdeDia)
    .map((l) => ({
      ...l,
      cache_escrita_5m: l.cache_escrita_5m ?? 0,
      cache_escrita_1h: l.cache_escrita_1h ?? 0,
      cache_leitura: l.cache_leitura ?? 0,
    }))
    .sort((a, b) => (a.dia < b.dia ? 1 : -1));
}

// Apaga linhas de uso de dias ANTERIORES a "antesDe" (nunca o dia de hoje: apagá-lo repunha os limites diários).
// Pode filtrar por código e/ou por um dia. Devolve quantas linhas apagou.
export async function apagarUso(filtro: { antesDe: string; codigo?: string; dia?: string }): Promise<number> {
  const { antesDe, codigo, dia } = filtro;
  const sb = supabase();
  if (sb) {
    const q = [`dia=lt.${antesDe}`];
    if (dia) q.push(`dia=eq.${dia}`);
    if (codigo) q.push(`codigo=eq.${encodeURIComponent(codigo)}`);
    const r = await fetch(`${sb.url}/rest/v1/uso_diario?${q.join("&")}&select=codigo`, {
      method: "DELETE",
      headers: { ...cabecalhos(sb.key), Prefer: "return=representation" },
    });
    if (!r.ok) throw new Error("Erro a apagar o histórico de uso na Supabase.");
    return ((await r.json()) as unknown[]).length;
  }
  const linhas = await lerFicheiro();
  const ficam = linhas.filter((l) => !(l.dia < antesDe && (!dia || l.dia === dia) && (!codigo || l.codigo === codigo)));
  await gravarFicheiro(ficam);
  return linhas.length - ficam.length;
}
