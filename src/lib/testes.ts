// Testes grátis feitos pelas próprias pessoas: quantos se aceitam por dia (0 = fechado).
import { hojeEmLuanda } from "./acesso";
import { contarTestesAutoHoje, temSupabase } from "./acessos";

export function limiteDiarioDeTestes(): number {
  const n = parseInt(process.env.TESTES_LIVRES_POR_DIA ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function estadoTestes(): Promise<{ aberto: boolean; motivo?: "fechado" | "esgotado" }> {
  const limite = limiteDiarioDeTestes();
  if (limite === 0 || !temSupabase()) return { aberto: false, motivo: "fechado" };
  const hoje = await contarTestesAutoHoje(hojeEmLuanda());
  return hoje >= limite ? { aberto: false, motivo: "esgotado" } : { aberto: true };
}
