export interface LaserCostInput {
  larguraMm: number;
  comprimentoMm: number;
  tempoSeg: number;
  areaChapaMm2: number;
  pesoChapaKg: number;
  /** R$/kg da chapa (maior custo da nota nos 3 meses). 0 quando não há nota. */
  rkgChapa: number;
  valorHoraLaser: number;
}

export interface LaserCostResult {
  areaPecaMm2: number;
  fracao: number;       // área peça / área chapa
  percentual: number;   // fração × 100
  valorChapa: number;   // R$/kg × peso da chapa
  custoMaterial: number;
  custoLaser: number;
  custoUnitario: number;
}

/**
 * Custo unitário de uma peça LA cortada a laser.
 * material = (área_peça / área_chapa) × (R$/kg × peso_chapa)
 * laser    = (tempo_seg / 3600) × valor_hora_laser
 */
export function calcularCustoPecaLaser(i: LaserCostInput): LaserCostResult {
  const areaPecaMm2 = i.larguraMm * i.comprimentoMm;
  const fracao = i.areaChapaMm2 > 0 ? areaPecaMm2 / i.areaChapaMm2 : 0;
  const valorChapa = i.rkgChapa * i.pesoChapaKg;
  const custoMaterial = fracao * valorChapa;
  const custoLaser =
    i.tempoSeg > 0 && i.valorHoraLaser > 0 ? (i.tempoSeg / 3600) * i.valorHoraLaser : 0;
  return {
    areaPecaMm2,
    fracao,
    percentual: fracao * 100,
    valorChapa,
    custoMaterial,
    custoLaser,
    custoUnitario: custoMaterial + custoLaser,
  };
}
