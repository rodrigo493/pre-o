import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
type ItemInsert = Database["public"]["Tables"]["itens_nota"]["Insert"];
type ItemRow = Database["public"]["Tables"]["itens_nota"]["Row"];

/** Insere itens em lotes (evita estourar o payload em notas grandes). */
export async function insertItens(itens: ItemInsert[]): Promise<ItemRow[]> {
  const LOTE = 500;
  const out: ItemRow[] = [];
  for (let i = 0; i < itens.length; i += LOTE) {
    const slice = itens.slice(i, i + LOTE);
    const { data, error } = await supabase.from("itens_nota").insert(slice).select();
    if (error) throw error;
    if (data) out.push(...data);
  }
  return out;
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
export type ItemPendente = ItemRow & {
  fornecedor: string | null;
  nota_numero: string | null;
  data_emissao: string;
};
export async function listItensPendentes(): Promise<ItemPendente[]> {
  const { data, error } = await supabase
    .from("itens_nota")
    .select("*, notas!inner(fornecedor, numero, data_emissao)")
    .is("produto_mestre_id", null);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    fornecedor: r.notas?.fornecedor ?? null,
    nota_numero: r.notas?.numero ?? null,
    data_emissao: r.notas?.data_emissao,
  }));
}

/** Todos os itens de uma nota (para visualização individual). */
export async function listItensPorNota(notaId: string): Promise<ItemRow[]> {
  const { data, error } = await supabase
    .from("itens_nota")
    .select("*")
    .eq("nota_id", notaId)
    .order("descricao");
  if (error) throw error;
  return data ?? [];
}
export async function vincularItem(id: string, produtoMestreId: string): Promise<void> {
  const { error } = await supabase.from("itens_nota").update({ produto_mestre_id: produtoMestreId }).eq("id", id);
  if (error) throw error;
}
