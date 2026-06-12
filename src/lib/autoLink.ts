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

export interface ProdutoComCodigo {
  id: string;
  codigo: string | null;
}

/** Normaliza código para comparação: trim + maiúsculas (preserva pontos/vírgulas). */
export function normalizeCodigo(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Mapa código-normalizado → id do produto. Guarda também a variante sem espaços
 * (tolera "X3,00 MM" vs "X3,00MM"). Mantém o primeiro em caso de duplicado.
 */
export function construirMapaCodigo(produtos: ProdutoComCodigo[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const p of produtos) {
    if (!p.codigo) continue;
    const k = normalizeCodigo(p.codigo);
    if (!k) continue;
    if (!mapa.has(k)) mapa.set(k, p.id);
    const kns = k.replace(/\s+/g, "");
    if (kns && !mapa.has(kns)) mapa.set(kns, p.id);
  }
  return mapa;
}

/** Candidatos de código a partir do cProd e de tokens da descrição com cara de código. */
function candidatosDeCodigo(cprod: string, descricao: string): string[] {
  const out: string[] = [];
  const c = normalizeCodigo(cprod);
  if (c) {
    out.push(c);
    const cns = c.replace(/\s+/g, "");
    if (cns !== c) out.push(cns);
  }
  for (const tok of descricao.toUpperCase().split(/\s+/)) {
    const t = tok.trim();
    if (t.length >= 4 && /\d/.test(t)) out.push(t); // só tokens "código-like" (têm dígito)
  }
  return out;
}

/**
 * Auto-vincula itens cujo cProd (ou um token da descrição) é igual a um código do
 * catálogo. Determinístico e de alta confiança (igualdade exata de código).
 */
export function aplicarAutoVinculoPorCodigo<T extends { id: string; cprod: string; descricao: string }>(
  itens: T[],
  mapaCodigo: Map<string, string>,
): { vinculados: Array<{ id: string; produtoMestreId: string }>; pendentes: T[] } {
  const vinculados: Array<{ id: string; produtoMestreId: string }> = [];
  const pendentes: T[] = [];
  for (const it of itens) {
    let mestre: string | undefined;
    for (const cand of candidatosDeCodigo(it.cprod, it.descricao)) {
      mestre = mapaCodigo.get(cand);
      if (mestre) break;
    }
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
