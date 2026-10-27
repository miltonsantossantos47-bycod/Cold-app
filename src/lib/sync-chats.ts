// Junta os chats deste aparelho com os da conta (sem apagar nada por engano).
import type { MsgChat, PerfilChat } from "./chats";

export type ChatLocal = {
  id: string;
  titulo: string;
  tituloDefinido: boolean;
  perfil: PerfilChat;
  msgs: MsgChat[];
  criado: number;
  atualizado: number;
};
export type MetaServidor = { id: string; titulo: string; atualizado: number; apagado: boolean };

// Assinatura do que há para guardar num chat: se mudar, é preciso enviar outra vez.
export function assinaturaChat(c: ChatLocal): string {
  return `${c.atualizado}|${c.titulo}|${c.msgs.length}|${JSON.stringify(c.perfil)}`;
}

export function decidirSync(local: ChatLocal[], servidor: MetaServidor[]) {
  const srv = new Map(servidor.map((m) => [m.id, m]));
  const loc = new Map(local.map((c) => [c.id, c]));
  const remover: string[] = []; // apagados noutro aparelho
  const baixar: string[] = []; // mais recentes (ou novos) na conta
  const iguais: string[] = []; // já iguais: nada a enviar
  for (const c of local) {
    const m = srv.get(c.id);
    if (!m) continue; // só existe aqui: será enviado
    if (m.apagado) remover.push(c.id);
    else if (m.atualizado > c.atualizado) baixar.push(c.id);
    else if (m.atualizado === c.atualizado && m.titulo === c.titulo) iguais.push(c.id);
    // se o local é mais recente (ou foi renomeado), será enviado
  }
  for (const m of servidor) {
    if (!m.apagado && !loc.has(m.id)) baixar.push(m.id);
  }
  return { remover, baixar, iguais };
}
