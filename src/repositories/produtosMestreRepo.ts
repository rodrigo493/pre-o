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
