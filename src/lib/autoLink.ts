export interface Vinculo {
  cprod: string;
  produtoMestreId: string;
}
export interface ItemParaVincular {
  id: string;
  cprod: string;
}
export interface ItemVinculado extends ItemParaVincular {
  produtoMestreId: string;
}
export interface ResultadoAutoVinculo {
  vinculados: ItemVinculado[];
  pendentes: ItemParaVincular[];
}

export function aplicarAutoVinculo(
  itens: ItemParaVincular[],
  vinculos: Vinculo[],
): ResultadoAutoVinculo {
  const mapa = new Map(vinculos.map((v) => [v.cprod.trim().toUpperCase(), v.produtoMestreId]));
  const vinculados: ItemVinculado[] = [];
  const pendentes: ItemParaVincular[] = [];
  for (const it of itens) {
    const mestre = mapa.get(it.cprod.trim().toUpperCase());
    if (mestre) vinculados.push({ ...it, produtoMestreId: mestre });
    else pendentes.push(it);
  }
  return { vinculados, pendentes };
}

export function normalizeCprod(cprod: string): string {
  return cprod.trim().toUpperCase();
}

/**
 * Outros itens da lista que compartilham o mesmo cprod do item alvo
 * (comparação case-insensitive, ignorando o próprio item).
 */
export function pendentesComMesmoCprod<T extends { id: string; cprod: string }>(
  alvo: { id: string; cprod: string },
  itens: T[],
): T[] {
  const chave = normalizeCprod(alvo.cprod);
  return itens.filter((it) => it.id !== alvo.id && normalizeCprod(it.cprod) === chave);
}
