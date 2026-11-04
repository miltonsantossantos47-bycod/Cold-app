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
  tokens_in: number; // entrada sem cache (input_tokens da API)
  tokens_out: number;
  // prompt caching (0 nos dias antes de existir, ou se a Supabase ainda não tiver as colunas)
  cache_escrita_5m: number;
  cache_escrita_1h: number;
  cache_leitura: number;
};

// Tokens de uma troca, como a API os devolve (somados nas continuações automáticas).
export type TokensTroca = {
  entrada: number; // input_tokens: não inclui o que foi escrito ou lido da cache
  saida: number;
  cacheEscrita5m: number;
  cacheEscrita1h: number;
  cacheLeitura: number;
};

const COLUNAS_CACHE = { cache_escrita_5m: 0, cache_escrita_1h: 0, cache_leitura: 0 };

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

export async function registarTroca(codigo: string, dia: string, t: TokensTroca) {
  const sb = supabase();
  if (sb) {
    const base = { p_codigo: codigo, p_dia: dia, p_in: t.entrada, p_out: t.saida };
    const r = await fetch(`${sb.url}/rest/v1/rpc/registar_uso_cache`, {
      method: "POST",
      headers: cabecalhos(sb.key),
      body: JSON.stringify({ ...base, p_escrita_5m: t.cacheEscrita5m, p_escrita_1h: t.cacheEscrita1h, p_leitura: t.cacheLeitura }),
    });
    if (r.ok) return;
    // Ainda sem a função nova (falta correr o supabase.sql): regista como antes, para a troca contar
    // sempre no limite diário. Os tokens de cache ficam por guardar.
    console.error(`[uso] registar_uso_cache falhou (${r.status}); corre o supabase.sql. A usar registar_uso.`);
    const antigo = await fetch(`${sb.url}/rest/v1/rpc/registar_uso`, {
      method: "POST",
      headers: cabecalhos(sb.key),
      body: JSON.stringify(base),
    });
    if (!antigo.ok) throw new Error("Erro a registar o uso na Supabase.");
    return;
  }
  const linhas = await lerFicheiro();
  let l = linhas.find((x) => x.codigo === codigo && x.dia === dia);
  if (!l) {
    l = { codigo, dia, trocas: 0, tokens_in: 0, tokens_out: 0, ...COLUNAS_CACHE };
    linhas.push(l);
  }
  l.trocas += 1;
  l.tokens_in += t.entrada;
  l.tokens_out += t.saida;
  l.cache_escrita_5m = (l.cache_escrita_5m ?? 0) + t.cacheEscrita5m;
  l.cache_escrita_1h = (l.cache_escrita_1h ?? 0) + t.cacheEscrita1h;
  l.cache_leitura = (l.cache_leitura ?? 0) + t.cacheLeitura;
  await gravarFicheiro(linhas);
}

export async function listarUso(desdeDia: string): Promise<LinhaUso[]> {
  const sb = supabase();
  if (sb) {
    const pedir = (colunas: string) =>
      fetch(`${sb.url}/rest/v1/uso_diario?dia=gte.${desdeDia}&select=${colunas}&order=dia.desc`, {
        headers: cabecalhos(sb.key),
        cache: "no-store",
      });
    let r = await pedir("codigo,dia,trocas,tokens_in,tokens_out,cache_escrita_5m,cache_escrita_1h,cache_leitura");
    if (!r.ok) r = await pedir("codigo,dia,trocas,tokens_in,tokens_out"); // ainda sem as colunas de cache
    if (!r.ok) throw new Error("Erro a listar o uso na Supabase.");
    return ((await r.json()) as Partial<LinhaUso>[]).map((l) => ({ ...COLUNAS_CACHE, ...l }) as LinhaUso);
  }
  const linhas = await lerFicheiro();
  return linhas
    .filter((l) => l.dia >= desdeDia)
    .map((l) => ({ ...COLUNAS_CACHE, ...l }))
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
