import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ConfigChapa = Database["public"]["Tables"]["config_chapas"]["Row"];

function dbErr(error: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(parts.join(" — ") || "erro no banco");
}

export async function listConfigChapas(): Promise<ConfigChapa[]> {
  const { data, error } = await supabase.from("config_chapas").select("*").order("espessura");
  if (error) throw dbErr(error);
  return data ?? [];
}

/** Aponta a chapa de uma espessura para um produto do catálogo (ou limpa, com null). */
export async function setChapaProduto(espessura: number, produtoMestreId: string | null): Promise<void> {
  const { error } = await supabase
    .from("config_chapas")
    .update({ produto_mestre_id: produtoMestreId })
    .eq("espessura", espessura);
  if (error) throw dbErr(error);
}
