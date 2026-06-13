import { describe, it, expect } from "vitest";
import { calcularCustoPecaTubo } from "@/lib/tuboCost";

describe("calcularCustoPecaTubo", () => {
  it("material (comp/6000 × R$kg × peso) + corte laser (tempo/3600 × valor-hora)", () => {
    const r = calcularCustoPecaTubo({
      comprimentoMm: 1200,
      tempoSeg: 60,
      valorHoraLaser: 120,
      tubo: { rkg: 10, pesoBarraKg: 18, comprimentoBarraMm: 6000 }, // barra 180; /mm 0,03
    });
    expect(r.custoMaterial).toBeCloseTo(1200 * (180 / 6000), 6); // 36
    expect(r.custoLaser).toBeCloseTo(2, 6); // 60/3600 × 120
    expect(r.custoUnitario).toBeCloseTo(38, 6);
  });

  it("sem tubo → só corte; tempo 0 → só material", () => {
    expect(calcularCustoPecaTubo({ comprimentoMm: 100, tempoSeg: 60, valorHoraLaser: 120, tubo: null }).custoMaterial).toBe(0);
    const r = calcularCustoPecaTubo({ comprimentoMm: 6000, tempoSeg: 0, valorHoraLaser: 120, tubo: { rkg: 10, pesoBarraKg: 18, comprimentoBarraMm: 6000 } });
    expect(r.custoLaser).toBe(0);
    expect(r.custoUnitario).toBeCloseTo(180, 6);
  });
});
