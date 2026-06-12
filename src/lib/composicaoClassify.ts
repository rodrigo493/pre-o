import type { ComposicaoItem } from "@/lib/composicaoParser";

/**
 * Prefixos de itens FABRICADOS por nós (montagem/intermediário). Não aparecem
 * nas notas de compra e são ignorados no custo — a ficha técnica já explode o
 * conteúdo deles até a matéria-prima (contá-los seria dupla contagem).
 */
export const PREFIXOS_FABRICADOS: ReadonlySet<string> = new Set([
  "EST",
  "MO",
  "MOP",
  "MOF",
  "KIT",
]);

/** Parte do código antes do primeiro "." ou espaço, em maiúsculas. */
export function prefixoDoCodigo(codigo: string): string {
  return codigo.trim().split(/[.\s]/, 1)[0].toUpperCase();
}

export function ehFabricado(codigo: string): boolean {
  return PREFIXOS_FABRICADOS.has(prefixoDoCodigo(codigo));
}

export interface ComposicaoSeparada {
  materiaPrima: ComposicaoItem[];
  fabricados: ComposicaoItem[];
}

export function separarComposicao(itens: ComposicaoItem[]): ComposicaoSeparada {
  return {
    materiaPrima: itens.filter((it) => !ehFabricado(it.codigo)),
    fabricados: itens.filter((it) => ehFabricado(it.codigo)),
  };
}

/** Código de peça usinada (US): a nota fiscal do próprio código é a mão de obra do torneiro. */
export function ehUsinado(codigo: string): boolean {
  return prefixoDoCodigo(codigo) === "US";
}
