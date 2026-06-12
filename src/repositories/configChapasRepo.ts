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
