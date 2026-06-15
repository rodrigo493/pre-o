export interface BitolaLike {
  tipo: string;
  nome: string;
  produto_mestre_id: string | null;
}
export interface ProdutoLike {
  id: string;
  codigo: string | null;
  nome?: string | null;
}

/** Prefixos de código que identificam a família de cada tipo de bitola. */
const PREFIXOS: Record<string, string[]> = {
  trefilado: ["FRM.TRE", "ACO TREF"],
  tubo: ["RED.", "QUAD.", "RET.", "CA.", "FCH"],
  plastico: ["PP.", "NY.", "UHMW", "PA.", "POM", "PEAD"],
};

/** Números relevantes de um texto: "12,70MM" → [12.7]; "RED.76.2X2" → [76.2, 2]. */
export function numeros(s: string): number[] {
  return (s.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0);
}

export interface ProdutoChapaLike {
  id: string;
  codigo: string | null;
  nome?: string | null;
  /** Tem custo resolvido (nota vinculada). Quando há vários, prefere o que tem custo. */
  comCusto?: boolean;
}

/**
 * Acha o produto da chapa pela MEDIDA (ex.: 1200×3000×1,2), independente do código.
 * Assim o vínculo da nota flui mesmo que a chapa esteja num produto com nome do
 * fornecedor (CFF/CFQ…) em vez do código padrão (CH.LISA…). Prefere o que tem custo.
 */
export function acharProdutoChapa(chapaCodigo: string, produtos: ProdutoChapaLike[]): string | null {
  const alvo = numeros(chapaCodigo);
  if (alvo.length === 0) return null;
  const candidatos = produtos.filter((p) => {
    const nums = numeros(`${p.codigo ?? ""} ${p.nome ?? ""}`);
    return alvo.every((a) => nums.some((n) => Math.abs(n - a) < 0.05));
  });
  if (candidatos.length === 0) return null;
  return (candidatos.find((p) => p.comCusto) ?? candidatos[0]).id;
}

function naFamilia(codigo: string, tipo: string): boolean {
  const cod = codigo.toUpperCase();
  const prefs = PREFIXOS[tipo] ?? [];
  return prefs.some((p) => cod.startsWith(p.toUpperCase()));
}

/**
 * Acha o id do produto que corresponde à bitola, pela MEDIDA, quando produto_mestre_id
 * não está definido. Assim o vínculo da nota (custo no produto) serve para todo o sistema:
 * a bitola encontra o produto certo pela dimensão, sem cadastro manual.
 */
export function acharProdutoDaBitola(bitola: BitolaLike, produtos: ProdutoLike[]): string | null {
  if (bitola.produto_mestre_id) return bitola.produto_mestre_id;

  const numsB = numeros(bitola.nome);
  if (numsB.length === 0) return null;

  let melhor: { id: string; extras: number } | null = null;
  for (const p of produtos) {
    const cod = p.codigo ?? "";
    if (!cod || !naFamilia(cod, bitola.tipo)) continue;
    const numsP = numeros(`${cod} ${p.nome ?? ""}`);
    // Todas as medidas da bitola precisam aparecer no produto (com tolerância).
    const casaTudo = numsB.every((nb) => numsP.some((np) => Math.abs(np - nb) < 0.05));
    if (!casaTudo) continue;
    // Prefere o produto com menos números "extras" (mais específico).
    const extras = numsP.length - numsB.length;
    if (melhor == null || extras < melhor.extras) melhor = { id: p.id, extras };
  }
  return melhor?.id ?? null;
}
