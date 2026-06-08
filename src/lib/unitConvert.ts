/** Normaliza unidade: maiúscula, sem acento, sem espaços. */
export function normalizeUnidade(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export interface ConversaoProduto {
  unidade?: string | null; // unidade principal (Nomus)
  unidadeSecundaria?: string | null; // unidade secundária (Nomus)
  fatorConversao?: number | null; // quantos da secundária = 1 principal
}

export interface ResultadoConversao {
  custo: number; // custo na unidade principal (ou cru se não converteu)
  convertido: boolean; // true se aplicou o fator
  pendente: boolean; // true se precisaria converter mas falta o fator
}

/**
 * Converte o custo de um item da nota para a unidade principal do produto.
 *
 * - unidade da nota vazia OU igual à principal → custo como está.
 * - unidade da nota = unidade secundária + fator > 0 → custo × fator.
 * - unidade diverge da principal e não casa com a secundária (ou sem fator) →
 *   custo cru + pendente=true (sinaliza para o usuário definir o fator).
 */
export function converterCusto(
  custo: number,
  unidadeNota: string | null | undefined,
  produto: ConversaoProduto,
): ResultadoConversao {
  const nota = normalizeUnidade(unidadeNota);
  const principal = normalizeUnidade(produto.unidade);
  const secundaria = normalizeUnidade(produto.unidadeSecundaria);
  const fator = produto.fatorConversao ?? null;

  // Sem unidade na nota ou produto sem unidade principal → não há o que converter.
  if (!nota || !principal || nota === principal) {
    return { custo, convertido: false, pendente: false };
  }

  if (secundaria && nota === secundaria) {
    if (fator != null && fator > 0) {
      return { custo: custo * fator, convertido: true, pendente: false };
    }
    return { custo, convertido: false, pendente: true };
  }

  // Unidade da nota diverge da principal e não casa com a secundária conhecida.
  return { custo, convertido: false, pendente: true };
}
