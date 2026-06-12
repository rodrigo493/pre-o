export interface PricingPercentages {
  vendas: number;
  marketing: number;
  custoOperacional: number;
  ipi: number;
  icms: number;
  pis: number;
  cofins: number;
  csll: number;
  ir: number;
  lucro: number;
  desgasteMaquinas: number;
}

export const defaultPercentages: PricingPercentages = {
  vendas: 7,
  marketing: 5,
  custoOperacional: 20,
  ipi: 5.2,
  icms: 18,
  pis: 1.65,
  cofins: 7.6,
  csll: 9,
  ir: 25,
  lucro: 20,
  desgasteMaquinas: 0,
};

export const percentageLabels: Record<keyof PricingPercentages, string> = {
  vendas: "Vendas",
  marketing: "Marketing",
  custoOperacional: "Custo Operacional",
  ipi: "IPI",
  icms: "ICMS",
  pis: "PIS (líquido)",
  cofins: "COFINS (líquido)",
  csll: "CSLL",
  ir: "IR",
  lucro: "Lucro líquido desejado",
  desgasteMaquinas: "Desgaste de Máquinas",
};

export function calculateSellingPrice(
  totalMP: number,
  percentages: PricingPercentages,
  freteValue: number = 0
) {
  const custoTotal = totalMP;

  const despesasPercent =
    (percentages.vendas + percentages.marketing + percentages.custoOperacional + percentages.desgasteMaquinas) / 100;

  const icmsPercent = percentages.icms / 100;
  const ipiPercent = percentages.ipi / 100;
  const pisPercent = (percentages.pis ?? 0) / 100;
  const cofinsPercent = (percentages.cofins ?? 0) / 100;
  const csllPercent = (percentages.csll ?? 9) / 100;
  const irPercent = (percentages.ir ?? 25) / 100;

  // "lucro" is the DESIRED NET profit after CSLL and IR.
  // We gross it up to find the gross profit that must be embedded in the price.
  const lucroLiquidoPercent = percentages.lucro / 100;
  const fatorTributacaoLucro = 1 - csllPercent - irPercent;

  if (fatorTributacaoLucro <= 0) {
    throw new Error("Percentuais inválidos");
  }

  // Gross profit needed so that after paying CSLL+IR we have the desired net profit
  const lucroBrutoPercent = lucroLiquidoPercent / fatorTributacaoLucro;

  // ICMS incide sobre (PV + IPI), portanto seu peso no divisor é icms% × (1 + ipi%)
  const icmsNoDiv = icmsPercent * (1 + ipiPercent);
  const divisor = 1 - despesasPercent - icmsNoDiv - pisPercent - cofinsPercent - lucroBrutoPercent;

  if (divisor <= 0) {
    throw new Error("Percentuais inválidos");
  }

  const precoBase = custoTotal / divisor;

  const valorICMS = precoBase * icmsNoDiv;
  const valorPIS = precoBase * pisPercent;
  const valorCOFINS = precoBase * cofinsPercent;
  const valorDespesas = precoBase * despesasPercent;

  const lucroBruto = precoBase * lucroBrutoPercent;
  const valorCSLL = lucroBruto * csllPercent;
  const valorIR = lucroBruto * irPercent;
  const lucroLiquido = lucroBruto - valorCSLL - valorIR;

  const valorIPI = precoBase * ipiPercent;
  const precoComIPI = precoBase + valorIPI;
  const precoComFrete = precoComIPI + freteValue;

  return {
    custoMP: totalMP,
    custoTotal,
    precoBase,
    precoVenda: precoBase,
    icms: valorICMS,
    pis: valorPIS,
    cofins: valorCOFINS,
    ipi: valorIPI,
    despesas: valorDespesas,
    lucroBruto,
    csll: valorCSLL,
    ir: valorIR,
    lucro: lucroLiquido,
    precoComIPI,
    precoComFrete,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function generateId(): string {
  return crypto.randomUUID();
}
