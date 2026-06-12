import { describe, it, expect } from "vitest";
import { calcularCustoPecaLaser } from "@/lib/laserCost";

describe("calcularCustoPecaLaser", () => {
  it("exemplo: peça 200x300mm, chapa 1,2mm (área 3,6M, valor R$340/un), 90s, R$120/h", () => {
    const r = calcularCustoPecaLaser({
      larguraMm: 200,
      comprimentoMm: 300,
      tempoSeg: 90,
      areaChapaMm2: 3_600_000,
      valorChapaUnit: 340, // = R$10/kg × 34kg, já por unidade
      valorHoraLaser: 120,
    });
    expect(r.areaPecaMm2).toBe(60_000);
    expect(r.valorChapa).toBe(340);
    expect(r.custoMaterial).toBeCloseTo(5.6667, 3);
    expect(r.custoLaser).toBeCloseTo(3, 6);
    expect(r.custoUnitario).toBeCloseTo(8.6667, 3);
  });

  it("tempo zero → custo laser zero", () => {
    const r = calcularCustoPecaLaser({
      larguraMm: 100, comprimentoMm: 100, tempoSeg: 0,
      areaChapaMm2: 4_500_000, valorChapaUnit: 845, valorHoraLaser: 120,
    });
    expect(r.custoLaser).toBe(0);
    expect(r.custoUnitario).toBeCloseTo(r.custoMaterial, 6);
  });

  it("valor da chapa zero → material zero (chapa sem custo na nota)", () => {
    const r = calcularCustoPecaLaser({
      larguraMm: 200, comprimentoMm: 300, tempoSeg: 90,
      areaChapaMm2: 3_600_000, valorChapaUnit: 0, valorHoraLaser: 120,
    });
    expect(r.custoMaterial).toBe(0);
    expect(r.custoUnitario).toBeCloseTo(3, 6);
  });

  it("área de chapa inválida (0) → material zero, sem divisão por zero", () => {
    const r = calcularCustoPecaLaser({
      larguraMm: 200, comprimentoMm: 300, tempoSeg: 0,
      areaChapaMm2: 0, valorChapaUnit: 340, valorHoraLaser: 120,
    });
    expect(Number.isFinite(r.custoMaterial)).toBe(true);
    expect(r.custoMaterial).toBe(0);
  });
});
