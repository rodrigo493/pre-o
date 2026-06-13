export interface TrefiladoInput {
  /** R$/kg do trefilado (custo da nota). */
  rkg: number;
  /** Peso da barra padrão (ex.: 6m). */
  pesoBarraKg: number;
  /** Comprimento da barra padrão em mm (ex.: 6000). */
  comprimentoBarraMm: number;
}

export interface PlasticoInput {
  /** Valor da barra (R$/un — a barra já é a unidade, ex.: 1m). */
  valorBarra: number;
  /** Comprimento da barra em mm (ex.: 1000). */
  comprimentoBarraMm: number;
}

export interface UsinadoCostInput {
  comprimentoMm: number;
  maoDeObra: number;
  trefilado: TrefiladoInput | null;
  plastico: PlasticoInput | null;
}

export interface UsinadoCostResult {
  custoTrefilado: number;
  custoPlastico: number;
  custoMaterial: number;
  custoUnitario: number;
}

/**
 * Custo de uma peça USINADA.
 * trefilado: barra (R$/kg × peso) rateada pelo comprimento (barra/6000mm).
 * plástico:  barra (R$/un) rateada pelo comprimento (barra/1000mm).
 * total = material (trefilado + plástico) + mão de obra.
 */
export function calcularCustoPecaUsinada(i: UsinadoCostInput): UsinadoCostResult {
  const comp = i.comprimentoMm;

  let custoTrefilado = 0;
  if (i.trefilado && i.trefilado.comprimentoBarraMm > 0) {
    const valorBarra = i.trefilado.rkg * i.trefilado.pesoBarraKg;
    custoTrefilado = (comp / i.trefilado.comprimentoBarraMm) * valorBarra;
  }

  let custoPlastico = 0;
  if (i.plastico && i.plastico.comprimentoBarraMm > 0) {
    custoPlastico = (comp / i.plastico.comprimentoBarraMm) * i.plastico.valorBarra;
  }

  const custoMaterial = custoTrefilado + custoPlastico;
  return {
    custoTrefilado,
    custoPlastico,
    custoMaterial,
    custoUnitario: custoMaterial + i.maoDeObra,
  };
}
