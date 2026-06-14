// Custo composto de produtos fabricados (US/TB/LA):
// custo(montado) = Σ componentes (ou custo_manual se sem composição)
//                + mão de obra da nota do próprio código (soma_nota)
//                + corte laser (tempo_corte_min/60 × valor_hora_laser).

export interface ExtrasInput {
  somaNota: boolean;
  /** Maior custo da nota do próprio código na janela de 8 meses (null = sem nota). */
  custoNota: number | null;
  tempoCorteMin: number | null;
  valorHoraLaser: number;
}

export interface ExtrasResult {
  maoDeObra: number;
  corteLaser: number;
  /** soma_nota ligado mas sem nota do código na janela → parcela 0 + alerta. */
  maoDeObraPendente: boolean;
}

export function custoExtras(i: ExtrasInput): ExtrasResult {
  const maoDeObra = i.somaNota && i.custoNota != null ? i.custoNota : 0;
  const maoDeObraPendente = i.somaNota && i.custoNota == null;
  const corteLaser =
    i.tempoCorteMin != null && i.tempoCorteMin > 0 && i.valorHoraLaser > 0
      ? (i.tempoCorteMin / 60) * i.valorHoraLaser
      : 0;
  return { maoDeObra, corteLaser, maoDeObraPendente };
}

export interface ProdutoCusto {
  id: string;
  tipo: "comprado" | "montado";
  custoManual: number | null;
  somaNota: boolean;
  tempoCorteMin: number | null;
}

export interface ComponenteRef {
  componenteId: string;
  qtd: number;
}

export interface CustoDeParams {
  produtos: Map<string, ProdutoCusto>;
  /** Custo resolvido dos comprados (maior da nota, já convertido). */
  custoCompradoPorId: Map<string, number | null>;
  /** Custo da nota do PRÓPRIO código dos montados (mão de obra US). */
  custoNotaPorId: Map<string, number | null>;
  compPorMontado: Map<string, ComponenteRef[]>;
  valorHoraLaser: number;
  /** Custo calculado de peças LA (chapa laser). Tem precedência sobre tipo/composição. */
  custoLaserPorId?: Map<string, number>;
}

/**
 * Cria a função recursiva de custo com memo e guarda de ciclo. Os extras entram
 * DENTRO da recursão: uma peça US/TB/LA usada como componente de um aparelho
 * propaga o custo completo (material + serviço).
 */
export function criarCustoDe(p: CustoDeParams): (id: string) => number {
  const memo = new Map<string, number>();
  const visitando = new Set<string>();
  const custoDe = (id: string): number => {
    const cache = memo.get(id);
    if (cache != null) return cache;
    // Peça LA (chapa laser): custo calculado tem precedência sobre tipo/composição.
    const laser = p.custoLaserPorId?.get(id);
    if (laser != null) {
      memo.set(id, laser);
      return laser;
    }
    const m = p.produtos.get(id);
    if (!m) return 0;
    if (m.tipo !== "montado") {
      const v = p.custoCompradoPorId.get(id) ?? 0;
      memo.set(id, v);
      return v;
    }
    if (visitando.has(id)) return 0; // ciclo: evita recursão infinita
    visitando.add(id);
    const comps = p.compPorMontado.get(id) ?? [];
    const extras = custoExtras({
      somaNota: m.somaNota,
      custoNota: p.custoNotaPorId.get(id) ?? null,
      tempoCorteMin: m.tempoCorteMin,
      valorHoraLaser: p.valorHoraLaser,
    });
    const parcial =
      comps.length > 0
        ? comps.reduce((s, c) => s + custoDe(c.componenteId) * c.qtd, 0)
        : m.custoManual ?? 0;
    const v = parcial + extras.maoDeObra + extras.corteLaser;
    visitando.delete(id);
    memo.set(id, v);
    return v;
  };
  return custoDe;
}
