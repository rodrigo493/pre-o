export interface TuboBarraInput {
  /** R$/kg do tubo (custo da nota). */
  rkg: number;
  /** Peso da barra padrão (6m). */
  pesoBarraKg: number;
  /** Comprimento da barra em mm (6000). */
  comprimentoBarraMm: number;
}

export interface TuboCostInput {
  comprimentoMm: number;
  tempoSeg: number;
  valorHoraLaser: number;
  tubo: TuboBarraInput | null;
}

export interface TuboCostResult {
  custoMaterial: number;
  custoLaser: number;
  custoUnitario: number;
}

/**
 * Custo de uma peça de TUBO.
 * material = (comprimento / barra) × (R$/kg × peso da barra)
 * laser    = (tempo_seg / 3600) × valor_hora_laser
 */
export function calcularCustoPecaTubo(i: TuboCostInput): TuboCostResult {
  let custoMaterial = 0;
  if (i.tubo && i.tubo.comprimentoBarraMm > 0) {
    const valorBarra = i.tubo.rkg * i.tubo.pesoBarraKg;
    custoMaterial = (i.comprimentoMm / i.tubo.comprimentoBarraMm) * valorBarra;
  }
  const custoLaser =
    i.tempoSeg > 0 && i.valorHoraLaser > 0 ? (i.tempoSeg / 3600) * i.valorHoraLaser : 0;
  return { custoMaterial, custoLaser, custoUnitario: custoMaterial + custoLaser };
}
