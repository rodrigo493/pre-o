import { describe, it, expect } from "vitest";
import { rowToConfig, configToRow, type ConfigRow } from "@/lib/markupConfig";
import { defaultPercentages } from "@/lib/pricing";

const row: ConfigRow = {
  vendas: 7, marketing: 5, custo_operacional: 20, ipi: 5.2, icms: 18,
  pis: 1.65, cofins: 7.6, csll: 9, ir: 25, lucro: 20, desgaste_maquinas: 0, frete: 0,
};

describe("markupConfig map", () => {
  it("rowToConfig mapeia snake_case → PricingPercentages", () => {
    const { config } = rowToConfig(row);
    expect(config).toEqual(defaultPercentages);
  });
  it("rowToConfig extrai frete separado", () => {
    const { frete } = rowToConfig({ ...row, frete: 12.5 });
    expect(frete).toBe(12.5);
  });
  it("configToRow é o inverso de rowToConfig", () => {
    const r = configToRow(defaultPercentages, 0);
    expect(r).toEqual(row);
  });
});
