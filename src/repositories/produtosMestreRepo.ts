import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Tables"]["produtos_mestre"]["Row"];
type Insert = Database["public"]["Tables"]["produtos_mestre"]["Insert"];

export async function listProdutosMestre(): Promise<Row[]> {
  const { data, error } = await supabase.from("produtos_mestre").select("*").order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function createProdutoMestre(input: Insert): Promise<Row> {
  const { data, error } = await supabase.from("produtos_mestre").insert(input).select().single();
  if (error) throw error;
  return data;
}
export async function updateProdutoMestre(id: string, patch: Database["public"]["Tables"]["produtos_mestre"]["Update"]): Promise<Row> {
  const { data, error } = await supabase.from("produtos_mestre").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export interface CatalogUpsert {
  codigo: string;
  nome: string;
  unidade: string | null;
  unidade_secundaria: string | null;
  tipo: "comprado" | "montado";
}

/**
 * Upsert do catálogo por `codigo` (índice único). Atualiza nome/unidade/tipo
 * dos existentes e insere os novos. Não toca em fator_conversao/preço manual.
 * Processa em lotes para não estourar o limite de payload.
 */
export async function upsertCatalogByCodigo(produtos: CatalogUpsert[]): Promise<number> {
  const LOTE = 500;
  let total = 0;
  for (let i = 0; i < produtos.length; i += LOTE) {
    const slice = produtos.slice(i, i + LOTE);
    const { error, count } = await supabase
      .from("produtos_mestre")
      .upsert(slice, { onConflict: "codigo", count: "exact" });
    if (error) throw error;
    total += count ?? slice.length;
  }
  return total;
}
