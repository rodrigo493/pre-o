import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
type ItemInsert = Database["public"]["Tables"]["itens_nota"]["Insert"];
type ItemRow = Database["public"]["Tables"]["itens_nota"]["Row"];

export async function insertItens(itens: ItemInsert[]): Promise<ItemRow[]> {
  const { data, error } = await supabase.from("itens_nota").insert(itens).select();
  if (error) throw error;
  return data ?? [];
}
/** Itens vinculados a um mestre, com a data de emissão da nota (join). */
export async function listItensComData(): Promise<Array<ItemRow & { data_emissao: string; nota_numero: string | null }>> {
  const { data, error } = await supabase
    .from("itens_nota")
    .select("*, notas!inner(data_emissao, numero)")
    .not("produto_mestre_id", "is", null);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, data_emissao: r.notas.data_emissao, nota_numero: r.notas.numero }));
}
export async function listItensPendentes(): Promise<ItemRow[]> {
  const { data, error } = await supabase.from("itens_nota").select("*").is("produto_mestre_id", null);
  if (error) throw error;
  return data ?? [];
}
export async function vincularItem(id: string, produtoMestreId: string): Promise<void> {
  const { error } = await supabase.from("itens_nota").update({ produto_mestre_id: produtoMestreId }).eq("id", id);
  if (error) throw error;
}
