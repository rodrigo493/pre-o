import { describe, it, expect } from "vitest";
import { calcularCustoPecaUsinada } from "@/lib/usinadoCost";

describe("calcularCustoPecaUsinada", () => {
  it("trefilado (R$/kg × peso barra ÷ 6000) + plástico (R$/un ÷ 1000) + mão de obra", () => {
    const r = calcularCustoPecaUsinada({
      comprimentoMm: 300,
      maoDeObra: 2,
      trefilado: { rkg: 10, pesoBarraKg: 9, comprimentoBarraMm: 6000 }, // barra = 90; /mm = 0,015
      plastico: { valorBarra: 5, comprimentoBarraMm: 1000 }, // /mm = 0,005
    });
    expect(r.custoTrefilado).toBeCloseTo(300 * (90 / 6000), 6); // 4,5
    expect(r.custoPlastico).toBeCloseTo(300 * (5 / 1000), 6); // 1,5
    expect(r.custoMaterial).toBeCloseTo(6, 6);
    expect(r.custoUnitario).toBeCloseTo(8, 6);
  });

  it("sem trefilado/plástico → só mão de obra", () => {
    const r = calcularCustoPecaUsinada({ comprimentoMm: 100, maoDeObra: 3, trefilado: null, plastico: null });
    expect(r.custoMaterial).toBe(0);
    expect(r.custoUnitario).toBe(3);
  });

  it("barra com comprimento 0 → sem divisão por zero", () => {
    const r = calcularCustoPecaUsinada({
      comprimentoMm: 100, maoDeObra: 0,
      trefilado: { rkg: 10, pesoBarraKg: 9, comprimentoBarraMm: 0 },
      plastico: null,
    });
    expect(Number.isFinite(r.custoTrefilado)).toBe(true);
    expect(r.custoTrefilado).toBe(0);
  });
});
