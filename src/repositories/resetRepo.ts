import { supabase } from "@/integrations/supabase/client";

function dbErr(error: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(parts.join(" — ") || "erro no banco");
}

/**
 * Apaga TODOS os dados de produtos, notas e vínculos (mantém as configurações
 * de markup). Respeita a ordem das FKs: vínculos → itens → notas → produtos.
 */
export async function apagarTodosOsDados(): Promise<void> {
  // Ordem importa por causa das chaves estrangeiras.
  const passos = [
    () => supabase.from("vinculos_cprod").delete().not("cprod", "is", null),
    () => supabase.from("itens_nota").delete().not("id", "is", null),
    () => supabase.from("notas").delete().not("id", "is", null),
    () => supabase.from("produtos_mestre").delete().not("id", "is", null),
  ];
  for (const passo of passos) {
    const { error } = await passo();
    if (error) throw dbErr(error);
  }
}
