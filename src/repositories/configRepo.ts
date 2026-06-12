import { supabase } from "@/integrations/supabase/client";
import { rowToConfig, configToRow, type AppConfig } from "@/lib/markupConfig";

export async function getConfig(): Promise<AppConfig> {
  const { data, error } = await supabase.from("config_markup").select("*").eq("id", 1).single();
  if (error) throw error;
  // Tolerância pré-migration 0010: banco sem a coluna ainda → 0.
  return rowToConfig({ ...data, valor_hora_laser: data.valor_hora_laser ?? 0 });
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const { error } = await supabase.from("config_markup").update(configToRow(config)).eq("id", 1);
  if (error) throw error;
}
