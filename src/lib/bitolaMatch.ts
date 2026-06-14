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
function numeros(s: string): number[] {
  return (s.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0);
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
