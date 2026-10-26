// Pequenos ajudantes para nomes e números de telefone.

// "ana maria silva" -> "ana" (só o 1.º nome, no máximo 30 caracteres)
export function primeiroNome(nome: unknown): string {
  if (typeof nome !== "string") return "";
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p.slice(0, 30);
}

// Aceita "923 111 222", "+244 923 111 222", "244923111222"... e devolve só dígitos com o 244 à frente.
// Devolve "" se não parecer um número válido.
export function normalizarTelefone(v: unknown): string {
  if (typeof v !== "string") return "";
  let d = v.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = "244" + d; // número angolano sem indicativo
  return d.length >= 11 && d.length <= 15 ? d : "";
}
