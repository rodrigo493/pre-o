import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
type NotaInsert = Database["public"]["Tables"]["notas"]["Insert"];
type NotaRow = Database["public"]["Tables"]["notas"]["Row"];
export async function createNota(input: NotaInsert): Promise<NotaRow> {
  const { data, error } = await supabase.from("notas").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function listNotas(): Promise<NotaRow[]> {
  const { data, error } = await supabase
    .from("notas")
    .select("*")
    .order("data_emissao", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
