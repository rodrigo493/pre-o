export interface LaserCostInput {
  larguraMm: number;
  comprimentoMm: number;
  tempoSeg: number;
  areaChapaMm2: number;
  /** Valor de 1 chapa inteira (custoBase do produto, já por unidade). 0 sem nota. */
  valorChapaUnit: number;
  valorHoraLaser: number;
}

export interface LaserCostResult {
  areaPecaMm2: number;
  fracao: number;       // área peça / área chapa
  percentual: number;   // fração × 100
  valorChapa: number;   // valor de 1 chapa inteira
  custoMaterial: number;
  custoLaser: number;
  custoUnitario: number;
}

/**
 * Custo unitário de uma peça LA cortada a laser.
 * material = (área_peça / área_chapa) × valor_da_chapa (por unidade)
 * laser    = (tempo_seg / 3600) × valor_hora_laser
 *
 * O valor da chapa por unidade já vem do custoBase do produto (kg da nota × peso,
 * via fator de conversão × no vínculo). Por isso aqui não multiplicamos pelo peso.
 */
export function calcularCustoPecaLaser(i: LaserCostInput): LaserCostResult {
  const areaPecaMm2 = i.larguraMm * i.comprimentoMm;
  const fracao = i.areaChapaMm2 > 0 ? areaPecaMm2 / i.areaChapaMm2 : 0;
  const valorChapa = i.valorChapaUnit;
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
