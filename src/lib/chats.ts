// Histórico de chats guardado na conta (tabela "chats" da Supabase; ver supabase.sql).
import { cabecalhos, supabase } from "./uso";

export type PerfilChat = {
  area?: string;
  nivel_atual?: string;
  objetivo?: string;
  ritmo_semanal?: string;
  modulo_atual?: string;
  licao_atual?: string;
  dificuldades_recentes?: string;
};
export type MsgChat = { role: "user" | "assistant"; content: string; hidden?: boolean };
export type ChatDB = {
  id: string;
  titulo: string;
  tituloDefinido: boolean;
  perfil: PerfilChat;
  msgs: MsgChat[];
  criado: number;
  atualizado: number;
};
export type Meta = { id: string; titulo: string; atualizado: number; apagado: boolean };

// Uma linha da tabela "chats" tal como a Supabase a devolve.
type LinhaChat = {
  id: string;
  titulo: string | null;
  titulo_definido: boolean;
  perfil: PerfilChat | null;
  msgs: MsgChat[] | null;
  criado: number | string;
  atualizado: number | string;
  apagado: boolean;
};

const MAX_CHATS = 100;
const MAX_MSGS = 400;
const MAX_TEXTO_MSG = 12000;
const MAX_BYTES_CHAT = 300_000;
const CAMPOS_PERFIL = ["area", "nivel_atual", "objetivo", "ritmo_semanal", "modulo_atual", "licao_atual", "dificuldades_recentes"] as const;

export function idValido(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

// Aceita só o formato esperado (nada de campos estranhos) e limita os tamanhos.
export function validarChat(raw: unknown): ChatDB | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (!idValido(c.id)) return null;
  if (typeof c.titulo !== "string" || c.titulo.length > 120) return null;
  if (typeof c.tituloDefinido !== "boolean") return null;
  if (!Number.isFinite(c.criado) || !Number.isFinite(c.atualizado)) return null;
  if (!c.perfil || typeof c.perfil !== "object") return null;
  const p = c.perfil as Record<string, unknown>;
  const perfil: PerfilChat = {};
  for (const k of CAMPOS_PERFIL) {
    const v = p[k];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length > 300) return null;
    perfil[k] = v;
  }
  if (!Array.isArray(c.msgs) || c.msgs.length > MAX_MSGS) return null;
  const msgs: MsgChat[] = [];
  for (const m of c.msgs) {
    if (!m || typeof m !== "object") return null;
    const mm = m as Record<string, unknown>;
    if (mm.role !== "user" && mm.role !== "assistant") return null;
    if (typeof mm.content !== "string" || mm.content.length > MAX_TEXTO_MSG) return null;
    msgs.push({ role: mm.role, content: mm.content, ...(mm.hidden === true ? { hidden: true } : {}) });
  }
  const chat: ChatDB = {
    id: c.id,
    titulo: c.titulo,
    tituloDefinido: c.tituloDefinido,
    perfil,
    msgs,
    criado: Math.trunc(c.criado as number),
    atualizado: Math.trunc(c.atualizado as number),
  };
  if (JSON.stringify(chat).length > MAX_BYTES_CHAT) return null;
  return chat;
}

function cfg() {
  const sb = supabase();
  if (!sb) throw new Error("Falta configurar a Supabase.");
  return sb;
}
const enc = encodeURIComponent;

export async function listarMetas(userId: string): Promise<Meta[]> {
  const sb = cfg();
  const r = await fetch(
    `${sb.url}/rest/v1/chats?user_id=eq.${enc(userId)}&select=id,titulo,atualizado,apagado&order=atualizado.desc&limit=300`,
    { headers: cabecalhos(sb.key), cache: "no-store" }
  );
  if (!r.ok) throw new Error("Erro a listar os chats (já correste o supabase.sql?).");
  const rows = (await r.json()) as Partial<LinhaChat>[];
  // devolve só o essencial (nunca o conteúdo das conversas)
  return rows.map((x) => ({ id: String(x.id), titulo: String(x.titulo ?? ""), atualizado: Number(x.atualizado), apagado: Boolean(x.apagado) }));
}

export async function obterChat(userId: string, id: string): Promise<ChatDB | null> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/chats?user_id=eq.${enc(userId)}&id=eq.${enc(id)}&select=*`, {
    headers: cabecalhos(sb.key),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Erro a ler o chat.");
  const rows = (await r.json()) as LinhaChat[];
  const row = rows[0];
  if (!row || row.apagado) return null;
  return {
    id: row.id,
    titulo: row.titulo ?? "",
    tituloDefinido: Boolean(row.titulo_definido),
    perfil: row.perfil ?? {},
    msgs: row.msgs ?? [],
    criado: Number(row.criado),
    atualizado: Number(row.atualizado),
  };
}

export type ResultadoGuardar = "ok" | "antigo" | "apagado" | "demasiados";

export async function guardarChat(userId: string, chat: ChatDB): Promise<ResultadoGuardar> {
  const sb = cfg();
  const ex = await fetch(`${sb.url}/rest/v1/chats?user_id=eq.${enc(userId)}&id=eq.${enc(chat.id)}&select=atualizado,apagado`, {
    headers: cabecalhos(sb.key),
    cache: "no-store",
  });
  if (!ex.ok) throw new Error("Erro a verificar o chat.");
  const existente = ((await ex.json()) as { atualizado: number; apagado: boolean }[])[0];
  if (existente?.apagado) return "apagado"; // apagar ganha sempre
  if (existente && Number(existente.atualizado) > chat.atualizado) return "antigo"; // o do servidor é mais recente
  if (!existente) {
    const metas = await listarMetas(userId);
    if (metas.filter((m) => !m.apagado).length >= MAX_CHATS) return "demasiados";
  }
  const r = await fetch(`${sb.url}/rest/v1/chats?on_conflict=user_id,id`, {
    method: "POST",
    headers: { ...cabecalhos(sb.key), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      id: chat.id,
      titulo: chat.titulo,
      titulo_definido: chat.tituloDefinido,
      perfil: chat.perfil,
      msgs: chat.msgs,
      criado: chat.criado,
      atualizado: chat.atualizado,
      apagado: false,
    }),
  });
  if (!r.ok) throw new Error("Erro a guardar o chat.");
  return "ok";
}

// Apagar = deixar uma marca ("apagado") sem conteúdo, para os outros aparelhos também o removerem.
export async function apagarChat(userId: string, id: string, atualizado: number): Promise<void> {
  const sb = cfg();
  const r = await fetch(`${sb.url}/rest/v1/chats?on_conflict=user_id,id`, {
    method: "POST",
    headers: { ...cabecalhos(sb.key), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      id,
      titulo: "",
      titulo_definido: false,
      perfil: {},
      msgs: [],
      criado: 0,
      atualizado,
      apagado: true,
    }),
  });
  if (!r.ok) throw new Error("Erro a apagar o chat.");
}
