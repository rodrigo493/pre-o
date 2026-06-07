import type { PricingPercentages } from "@/lib/pricing";

export interface ConfigRow {
  vendas: number; marketing: number; custo_operacional: number;
  ipi: number; icms: number; pis: number; cofins: number;
  csll: number; ir: number; lucro: number; desgaste_maquinas: number;
  frete: number;
}

export function rowToConfig(row: ConfigRow): { config: PricingPercentages; frete: number } {
  return {
    config: {
      vendas: row.vendas, marketing: row.marketing,
      custoOperacional: row.custo_operacional, ipi: row.ipi, icms: row.icms,
      pis: row.pis, cofins: row.cofins, csll: row.csll, ir: row.ir,
      lucro: row.lucro, desgasteMaquinas: row.desgaste_maquinas,
    },
    frete: row.frete,
  };
}

export function configToRow(config: PricingPercentages, frete: number): ConfigRow {
  return {
    vendas: config.vendas, marketing: config.marketing,
    custo_operacional: config.custoOperacional, ipi: config.ipi, icms: config.icms,
    pis: config.pis, cofins: config.cofins, csll: config.csll, ir: config.ir,
    lucro: config.lucro, desgaste_maquinas: config.desgasteMaquinas, frete,
  };
}
