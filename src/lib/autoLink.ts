export interface Vinculo {
  cprod: string;
  produtoMestreId: string;
  fatorConversao?: number | null;
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

/** Normaliza descrição para comparação exata: sem acento, minúscula, espaços colapsados. */
export function normalizeDescricao(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface ProdutoOficial {
  id: string;
  nome: string;
}

/**
 * Mapa descrição-normalizada → id do produto oficial. Em caso de descrições
 * duplicadas no catálogo, mantém o primeiro (evita vínculo ambíguo).
 */
export function construirMapaDescricao(produtos: ProdutoOficial[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const p of produtos) {
    const chave = normalizeDescricao(p.nome);
    if (chave && !mapa.has(chave)) mapa.set(chave, p.id);
  }
  return mapa;
}

/** Auto-vincula itens cuja descrição é IGUAL (normalizada) à de um produto oficial. */
export function aplicarAutoVinculoPorDescricao<T extends { id: string; descricao: string }>(
  itens: T[],
  mapaDescricao: Map<string, string>,
): { vinculados: Array<{ id: string; produtoMestreId: string }>; pendentes: T[] } {
  const vinculados: Array<{ id: string; produtoMestreId: string }> = [];
  const pendentes: T[] = [];
  for (const it of itens) {
    const mestre = mapaDescricao.get(normalizeDescricao(it.descricao));
    if (mestre) vinculados.push({ id: it.id, produtoMestreId: mestre });
    else pendentes.push(it);
  }
  return { vinculados, pendentes };
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
