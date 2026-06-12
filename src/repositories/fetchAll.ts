/**
 * Busca TODAS as linhas de uma query do Supabase, paginando.
 *
 * O PostgREST/Supabase limita cada resposta a no máximo 1000 linhas (config
 * `max-rows`). Sem paginar, qualquer tabela com mais de 1000 registros (catálogo,
 * itens de nota) vem truncada — o que causa buscas incompletas e custos errados.
 *
 * Passe uma função que aplica `.range(from, to)` numa query já montada.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await build(from, from + PAGINA - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGINA) break;
  }
  return out;
}
