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
  const materiaPrima: ComposicaoItem[] = [];
  const fabricados: ComposicaoItem[] = [];
  for (const it of itens) {
    (ehFabricado(it.codigo) ? fabricados : materiaPrima).push(it);
  }
  return { materiaPrima, fabricados };
}
