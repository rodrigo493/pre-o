import { describe, it, expect } from "vitest";
import { rowToConfig, configToRow, type ConfigRow, type AppConfig } from "@/lib/markupConfig";
import { defaultPercentages } from "@/lib/pricing";

const row: ConfigRow = {
  vendas: 7, marketing: 5, custo_operacional: 20, ipi: 5.2, icms: 18,
  pis: 1.65, cofins: 7.6, csll: 9, ir: 25, lucro: 20, desgaste_maquinas: 0,
  valor_hora_laser: 0,
};

const config: AppConfig = { ...defaultPercentages, valorHoraLaser: 0 };

describe("markupConfig map", () => {
  it("rowToConfig mapeia snake_case → AppConfig", () => {
    expect(rowToConfig(row)).toEqual(config);
  });
  it("configToRow é o inverso de rowToConfig", () => {
    expect(configToRow(config)).toEqual(row);
  });
  it("round-trip preserva valor_hora_laser", () => {
    const r: ConfigRow = { ...row, valor_hora_laser: 120 };
    expect(configToRow(rowToConfig(r))).toEqual(r);
    expect(rowToConfig(r).valorHoraLaser).toBe(120);
  });
});
