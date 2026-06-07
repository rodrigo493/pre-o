import { supabase } from "@/integrations/supabase/client";
import type { Vinculo } from "@/lib/autoLink";
export async function listVinculos(): Promise<Vinculo[]> {
  const { data, error } = await supabase.from("vinculos_cprod").select("cprod, produto_mestre_id");
  if (error) throw error;
  return (data ?? []).map((r) => ({ cprod: r.cprod, produtoMestreId: r.produto_mestre_id }));
}
export async function upsertVinculo(cprod: string, produtoMestreId: string): Promise<void> {
  const { error } = await supabase.from("vinculos_cprod")
    .upsert({ cprod: cprod.trim().toUpperCase(), produto_mestre_id: produtoMestreId });
  if (error) throw error;
}
