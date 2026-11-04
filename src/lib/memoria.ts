// Memória do aluno entre aulas: conceitos dominados e ideias erradas por resolver.
// O tutor regista o que deteta numa linha [[MEMORIA: domina=...; confunde=...; resolvido=...]]
// (o backend remove-a do texto). Cada registo fica no perfil do chat onde aconteceu (perfil.memoria),
// que já é guardado na conta; o perfil do aluno junta os registos de todos os chats da mesma área.

export type TipoMemoria = "domina" | "confunde" | "resolvido";
export type RegistoMemoria = { t: TipoMemoria; x: string; em: number };
export type MemoriaAluno = { domina: string[]; porResolver: string[] };

const TIPOS: TipoMemoria[] = ["domina", "confunde", "resolvido"];
export const MAX_TEXTO_MEMORIA = 120;
export const MAX_REGISTOS_POR_CHAT = 60;
const MAX_POR_RESPOSTA = 5;
const MAX_DOMINA = 25; // o que vai para o prompt: os mais recentes
const MAX_POR_RESOLVER = 15;

// Texto curto, numa linha e sem caracteres que possam abrir marcadores ou instruções.
export function limparTextoMemoria(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/[\[\]{}<>|;=\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXTO_MEMORIA);
}

function chave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Lê as linhas [[MEMORIA: ...]] de uma resposta do tutor.
export function lerMemoria(texto: string): { t: TipoMemoria; x: string }[] {
  const registos: { t: TipoMemoria; x: string }[] = [];
  for (const m of Array.from(texto.matchAll(/\[\[MEMORIA:\s*([^\]]*)\]\]/gi))) {
    for (const par of m[1].split(";")) {
      const i = par.indexOf("=");
      if (i === -1) continue;
      const t = chave(par.slice(0, i)) as TipoMemoria;
      if (!TIPOS.includes(t)) continue;
      for (const v of par.slice(i + 1).split("|")) {
        const x = limparTextoMemoria(v);
        if (x && registos.length < MAX_POR_RESPOSTA * TIPOS.length) registos.push({ t, x });
      }
    }
  }
  return registos;
}

// Aceita só registos bem formados (vêm do navegador ou da conta).
export function validarRegistos(raw: unknown): RegistoMemoria[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_REGISTOS_POR_CHAT) return null;
  const out: RegistoMemoria[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const { t, x, em } = r as Record<string, unknown>;
    if (!TIPOS.includes(t as TipoMemoria) || typeof x !== "string" || x.length > MAX_TEXTO_MEMORIA + 40) return null;
    if (!Number.isFinite(em)) return null;
    out.push({ t: t as TipoMemoria, x, em: Math.trunc(em as number) });
  }
  return out;
}

// Junta os registos (de vários chats) pela ordem em que aconteceram.
// "resolvido" tira a ideia errada da lista por resolver e conta como domínio.
export function juntarMemoria(registos: RegistoMemoria[]): MemoriaAluno {
  const domina = new Map<string, string>();
  const porResolver = new Map<string, string>();
  const parecidas = (a: string, b: string) => a === b || (a.length > 12 && b.includes(a)) || (b.length > 12 && a.includes(b));
  for (const r of [...registos].sort((a, b) => a.em - b.em)) {
    const k = chave(r.x);
    if (!k) continue;
    if (r.t === "domina") {
      domina.delete(k);
      domina.set(k, r.x);
    } else if (r.t === "confunde") {
      porResolver.delete(k);
      porResolver.set(k, r.x);
    } else {
      porResolver.forEach((_, kk) => {
        if (parecidas(k, kk)) porResolver.delete(kk);
      });
      domina.delete(k);
      const ideia = r.x.replace(/^já não /i, "");
      domina.set(k, `já não ${ideia.charAt(0).toLowerCase()}${ideia.slice(1)}`);
    }
  }
  return {
    domina: Array.from(domina.values()).slice(-MAX_DOMINA),
    porResolver: Array.from(porResolver.values()).slice(-MAX_POR_RESOLVER),
  };
}

// A memória enviada pelo navegador para o prompt: listas curtas de textos limpos.
export function limparMemoriaAluno(raw: unknown): MemoriaAluno {
  const lista = (v: unknown, max: number) =>
    Array.isArray(v) ? v.map(limparTextoMemoria).filter(Boolean).slice(-max) : [];
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { domina: lista(m.domina, MAX_DOMINA), porResolver: lista(m.porResolver, MAX_POR_RESOLVER) };
}
