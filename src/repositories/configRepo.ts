import { supabase } from "@/integrations/supabase/client";
import { rowToConfig, configToRow } from "@/lib/markupConfig";
import type { PricingPercentages } from "@/lib/pricing";
export async function getConfig(): Promise<{ config: PricingPercentages; frete: number }> {
  const { data, error } = await supabase.from("config_markup").select("*").eq("id", 1).single();
  if (error) throw error;
  return rowToConfig(data);
}
export async function saveConfig(config: PricingPercentages, frete: number): Promise<void> {
  const { error } = await supabase.from("config_markup").update(configToRow(config, frete)).eq("id", 1);
  if (error) throw error;
}
