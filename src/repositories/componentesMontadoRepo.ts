import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Tables"]["componentes_montado"]["Row"];

function dbErr(error: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(parts.join(" — ") || "erro no banco");
}

/** Todos os componentes de montados (para o cálculo global de preços). */
export async function listComponentes(): Promise<Row[]> {
  const { data, error } = await supabase.from("componentes_montado").select("*");
  if (error) throw dbErr(error);
  return data ?? [];
}

/** Componentes de um montado específico. */
export async function listComponentesDoMontado(montadoId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from("componentes_montado")
    .select("*")
    .eq("montado_id", montadoId);
  if (error) throw dbErr(error);
  return data ?? [];
}

/** Adiciona (ou atualiza a quantidade de) um componente no montado. */
export async function upsertComponente(
  montadoId: string,
  componenteId: string,
  quantidade: number,
): Promise<void> {
  const { error } = await supabase
    .from("componentes_montado")
    .upsert(
      { montado_id: montadoId, componente_id: componenteId, quantidade },
      { onConflict: "montado_id,componente_id" },
    );
  if (error) throw dbErr(error);
}

export async function removeComponente(id: string): Promise<void> {
  const { error } = await supabase.from("componentes_montado").delete().eq("id", id);
  if (error) throw dbErr(error);
}

export async function updateQuantidade(id: string, quantidade: number): Promise<void> {
  const { error } = await supabase
    .from("componentes_montado")
    .update({ quantidade })
    .eq("id", id);
  if (error) throw dbErr(error);
}
