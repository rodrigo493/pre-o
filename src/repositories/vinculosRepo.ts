import { supabase } from "@/integrations/supabase/client";
import type { Vinculo } from "@/lib/autoLink";

export async function listVinculos(): Promise<Vinculo[]> {
  const { data, error } = await supabase
    .from("vinculos_cprod")
    .select("cprod, produto_mestre_id, fator_conversao");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    cprod: r.cprod,
    produtoMestreId: r.produto_mestre_id,
    fatorConversao: r.fator_conversao,
  }));
}

export async function upsertVinculo(
  cprod: string,
  produtoMestreId: string,
  fatorConversao?: number | null,
): Promise<void> {
  const row: { cprod: string; produto_mestre_id: string; fator_conversao?: number | null } = {
    cprod: cprod.trim().toUpperCase(),
    produto_mestre_id: produtoMestreId,
  };
  if (fatorConversao !== undefined) row.fator_conversao = fatorConversao;
  const { error } = await supabase.from("vinculos_cprod").upsert(row);
  if (error) throw error;
}
