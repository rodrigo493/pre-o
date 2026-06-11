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
  categoria: string | null;
}

function dbErr(error: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(parts.join(" — ") || "erro no banco");
}

/**
 * Upsert do catálogo usando a CHAVE PRIMÁRIA (id), que sempre tem constraint
 * única — evita depender de um índice único em `codigo` (que o ON CONFLICT do
 * Supabase não casa quando é parcial). Busca os códigos existentes, anexa o id
 * nos que já existem (→ update) e deixa os novos sem id (→ insert). Não toca em
 * fator_conversao nem preço manual. Processa em lotes.
 */
export async function upsertCatalogByCodigo(produtos: CatalogUpsert[]): Promise<number> {
  // Mapa codigo → id dos já existentes.
  const { data: existentes, error: selErr } = await supabase
    .from("produtos_mestre")
    .select("id, codigo")
    .not("codigo", "is", null);
  if (selErr) throw dbErr(selErr);
  const idPorCodigo = new Map<string, string>();
  for (const r of existentes ?? []) {
    if (r.codigo) idPorCodigo.set(r.codigo, r.id);
  }

  // Separa em lotes HOMOGÊNEOS: novos (sem id → insert) e existentes (com id →
  // update por upsert na PK). Lote misto faz o PostgREST mandar id=null nos novos
  // e viola o not-null (23502).
  const paraInserir: Insert[] = [];
  const paraAtualizar: Insert[] = [];
  for (const p of produtos) {
    const id = idPorCodigo.get(p.codigo);
    const base = {
      codigo: p.codigo,
      nome: p.nome,
      unidade: p.unidade,
      unidade_secundaria: p.unidade_secundaria,
      tipo: p.tipo,
      categoria: p.categoria,
    };
    if (id) paraAtualizar.push({ id, ...base });
    else paraInserir.push(base);
  }

  const LOTE = 500;
  let total = 0;

  for (let i = 0; i < paraInserir.length; i += LOTE) {
    const slice = paraInserir.slice(i, i + LOTE);
    const { error, count } = await supabase
      .from("produtos_mestre")
      .insert(slice, { count: "exact" });
    if (error) throw dbErr(error);
    total += count ?? slice.length;
  }

  for (let i = 0; i < paraAtualizar.length; i += LOTE) {
    const slice = paraAtualizar.slice(i, i + LOTE);
    const { error, count } = await supabase
      .from("produtos_mestre")
      .upsert(slice, { count: "exact" }); // todos têm id → conflito na PK → update
    if (error) throw dbErr(error);
    total += count ?? slice.length;
  }

  return total;
}

export interface FindOrCreateMontadoInput {
  codigo: string;
  nome: string;
  categoria: string | null;
}

/**
 * Busca o produto pelo código: se existe, atualiza nome/categoria e marca como
 * montado; se não, cria. Evita o erro de código duplicado do índice único
 * parcial (mesmo padrão do upsertCatalogByCodigo: decidir insert vs update no
 * app, nunca ON CONFLICT em `codigo`).
 */
export async function findOrCreateMontadoByCodigo(
  input: FindOrCreateMontadoInput,
): Promise<string> {
  const codigo = input.codigo.trim();
  const patch = {
    nome: input.nome,
    categoria: input.categoria,
    tipo: "montado" as const,
  };

  const { data: existentes, error: selErr } = await supabase
    .from("produtos_mestre")
    .select("id")
    .eq("codigo", codigo)
    .limit(1);
  if (selErr) throw dbErr(selErr);

  if (existentes && existentes.length > 0) {
    const id = existentes[0].id;
    const { error } = await supabase.from("produtos_mestre").update(patch).eq("id", id);
    if (error) throw dbErr(error);
    return id;
  }

  const { data, error } = await supabase
    .from("produtos_mestre")
    .insert({ codigo, ...patch })
    .select("id")
    .single();
  if (error) throw dbErr(error);
  return data.id;
}
