import type { PricingPercentages } from "@/lib/pricing";

/** Configuração global da aplicação: percentuais do markup + valor da hora do laser. */
export interface AppConfig extends PricingPercentages {
  valorHoraLaser: number;
}

export interface ConfigRow {
  vendas: number; marketing: number; custo_operacional: number;
  ipi: number; icms: number; pis: number; cofins: number;
  csll: number; ir: number; lucro: number; desgaste_maquinas: number;
  valor_hora_laser: number;
}

export function rowToConfig(row: ConfigRow): AppConfig {
  return {
    vendas: row.vendas, marketing: row.marketing,
    custoOperacional: row.custo_operacional, ipi: row.ipi, icms: row.icms,
    pis: row.pis, cofins: row.cofins, csll: row.csll, ir: row.ir,
    lucro: row.lucro, desgasteMaquinas: row.desgaste_maquinas,
    valorHoraLaser: row.valor_hora_laser,
  };
}

export function configToRow(config: AppConfig): ConfigRow {
  return {
    vendas: config.vendas, marketing: config.marketing,
    custo_operacional: config.custoOperacional, ipi: config.ipi, icms: config.icms,
    pis: config.pis, cofins: config.cofins, csll: config.csll, ir: config.ir,
    lucro: config.lucro, desgaste_maquinas: config.desgasteMaquinas,
    valor_hora_laser: config.valorHoraLaser,
  };
}
