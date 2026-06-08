/** Similaridade de descrições por sobreposição de tokens (coeficiente de Dice). */

function tokenize(text: string): Set<string> {
  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return new Set(normalized.split(/\s+/).filter((t) => t.length >= 2));
}

/** Coeficiente de Dice entre dois conjuntos de tokens (0..1). */
export function diceScore(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return (2 * inter) / (sa.size + sb.size);
}

export interface MatchCandidate {
  id: string;
  text: string;
}

export interface MatchResult {
  id: string;
  score: number;
}

/**
 * Melhor candidato para a consulta, acima do limiar. `null` se nada passar.
 * Default do limiar: 0.4 (≈ metade dos tokens em comum).
 */
export function bestMatch(
  query: string,
  candidates: MatchCandidate[],
  threshold = 0.4,
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const c of candidates) {
    const score = diceScore(query, c.text);
    if (score >= threshold && (best === null || score > best.score)) {
      best = { id: c.id, score };
    }
  }
  return best;
}
