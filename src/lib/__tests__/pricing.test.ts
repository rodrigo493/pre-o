// src/lib/__tests__/pricing.test.ts
import { describe, it, expect } from "vitest";
import { calculateSellingPrice, defaultPercentages } from "@/lib/pricing";

describe("calculateSellingPrice — Lucro Real mark-up divisor", () => {
  it("defaults PIS = 1.65 e COFINS = 7.6", () => {
    expect(defaultPercentages.pis).toBe(1.65);
    expect(defaultPercentages.cofins).toBe(7.6);
  });

  it("ICMS incide sobre PV+IPI (fator corrigido)", () => {
    const result = calculateSellingPrice(1000, {
      ...defaultPercentages,
      vendas: 0, marketing: 0, custoOperacional: 0, desgasteMaquinas: 0,
      icms: 18, ipi: 10, pis: 0, cofins: 0, lucro: 0, csll: 0, ir: 0,
    });
    // fator_icms = 0.18 * 1.10 = 0.198; divisor = 1 - 0.198 = 0.802
    // PV = 1000 / 0.802 ≈ 1246.88
    expect(result.precoVenda).toBeCloseTo(1246.88, 2);
    expect(result.icms).toBeCloseTo(246.88, 2);
  });

  it("sem IPI, ICMS usa fator simples", () => {
    const result = calculateSellingPrice(1000, {
      ...defaultPercentages,
      vendas: 0, marketing: 0, custoOperacional: 0, desgasteMaquinas: 0,
      icms: 18, ipi: 0, pis: 0, cofins: 0, lucro: 0, csll: 0, ir: 0,
    });
    // fator_icms = 0.18 * 1.0 = 0.18; divisor = 0.82
    expect(result.precoVenda).toBeCloseTo(1219.51, 2);
  });

  it("lucro líquido é gross-up correto após CSLL+IR", () => {
    const result = calculateSellingPrice(1000, {
      ...defaultPercentages,
      vendas: 0, marketing: 0, custoOperacional: 0, desgasteMaquinas: 0,
      icms: 0, ipi: 0, pis: 0, cofins: 0,
      lucro: 20, csll: 9, ir: 25,
    });
    // fatorLucro = 0.66; lucroBruto% = 0.30303...; divisor = 0.69697...; PV = 1000 / 0.69697 ≈ 1434.78
    expect(result.precoVenda).toBeCloseTo(1434.78, 2);
    expect(result.lucro).toBeCloseTo(result.precoVenda * 0.2, 2);
  });

  it("lança erro quando divisor <= 0", () => {
    expect(() => calculateSellingPrice(1000, {
      ...defaultPercentages,
      vendas: 60, marketing: 60, custoOperacional: 0, desgasteMaquinas: 0,
      icms: 0, ipi: 0, pis: 0, cofins: 0, lucro: 0, csll: 0, ir: 0,
    })).toThrow("Percentuais inválidos");
  });
});
