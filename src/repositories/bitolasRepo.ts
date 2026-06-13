import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ConfigBitola = Database["public"]["Tables"]["config_bitolas"]["Row"];
type BitolaInsert = Database["public"]["Tables"]["config_bitolas"]["Insert"];
export type PecaUsinado = Database["public"]["Tables"]["pecas_usinado"]["Row"];
type UsinadoInsert = Database["public"]["Tables"]["pecas_usinado"]["Insert"];

function dbErr(error: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(parts.join(" — ") || "erro no banco");
}

export async function listConfigBitolas(): Promise<ConfigBitola[]> {
  const { data, error } = await supabase.from("config_bitolas").select("*").order("tipo").order("nome");
  if (error) throw dbErr(error);
  return data ?? [];
}

export async function addBitola(input: BitolaInsert): Promise<void> {
  const { error } = await supabase.from("config_bitolas").insert(input);
  if (error) throw dbErr(error);
}

export async function updateBitola(id: string, patch: Database["public"]["Tables"]["config_bitolas"]["Update"]): Promise<void> {
  const { error } = await supabase.from("config_bitolas").update(patch).eq("id", id);
  if (error) throw dbErr(error);
}

export async function deleteBitola(id: string): Promise<void> {
  const { error } = await supabase.from("config_bitolas").delete().eq("id", id);
  if (error) throw dbErr(error);
}

export async function listPecasUsinado(): Promise<PecaUsinado[]> {
  const { data, error } = await supabase.from("pecas_usinado").select("*");
  if (error) throw dbErr(error);
  return data ?? [];
}

export async function getPecaUsinado(produtoId: string): Promise<PecaUsinado | null> {
  const { data, error } = await supabase
    .from("pecas_usinado")
    .select("*")
    .eq("produto_mestre_id", produtoId)
    .maybeSingle();
  if (error) throw dbErr(error);
  return data ?? null;
}

export async function upsertPecaUsinado(spec: UsinadoInsert): Promise<void> {
  const { error } = await supabase
    .from("pecas_usinado")
    .upsert({ ...spec, updated_at: new Date().toISOString() }, { onConflict: "produto_mestre_id" });
  if (error) throw dbErr(error);
}
