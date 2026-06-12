import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PecaLaser = Database["public"]["Tables"]["pecas_laser"]["Row"];
type Insert = Database["public"]["Tables"]["pecas_laser"]["Insert"];

function dbErr(error: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(parts.join(" — ") || "erro no banco");
}

export async function listPecasLaser(): Promise<PecaLaser[]> {
  const { data, error } = await supabase.from("pecas_laser").select("*");
  if (error) throw dbErr(error);
  return data ?? [];
}

export async function getPecaLaser(produtoId: string): Promise<PecaLaser | null> {
  const { data, error } = await supabase
    .from("pecas_laser")
    .select("*")
    .eq("produto_mestre_id", produtoId)
    .maybeSingle();
  if (error) throw dbErr(error);
  return data ?? null;
}

export async function upsertPecaLaser(spec: Insert): Promise<void> {
  const { error } = await supabase
    .from("pecas_laser")
    .upsert({ ...spec, updated_at: new Date().toISOString() }, { onConflict: "produto_mestre_id" });
  if (error) throw dbErr(error);
}
