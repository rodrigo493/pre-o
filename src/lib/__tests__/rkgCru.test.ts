import { describe, it, expect } from "vitest";
import { rkgCru } from "@/lib/rkgCru";

describe("rkgCru — R$/kg cru do item (desfaz qualquer fator)", () => {
  it("sem fator → usa o custo direto (R$/kg da nota)", () => {
    expect(rkgCru(6.61, null, null)).toBeCloseTo(6.61, 6);
    expect(rkgCru(6.13, 0, "dividir")).toBeCloseTo(6.13, 6);
  });

  it("fator dividir (÷) → desfaz multiplicando de volta", () => {
    // tubo: custoBase ficou 0,95 (= 6,61 ÷ 6,97 por fator errado) → recupera 6,61
    expect(rkgCru(0.948, 6.97, "dividir")).toBeCloseTo(6.61, 2);
  });

  it("fator multiplicar (×) → desfaz dividindo de volta", () => {
    // chapa: custoBase ficou 469,20 (= 5,52 × 85) → recupera 5,52
    expect(rkgCru(469.2, 85, "multiplicar")).toBeCloseTo(5.52, 2);
  });

  it("calibração real: R$/kg × peso = valor da barra/chapa", () => {
    // RED.25.4X2: 6,61/kg × 6,97kg = R$46,07/barra
    expect(rkgCru(6.61, null, null) * 6.97).toBeCloseTo(46.07, 1);
    // CH 3,00mm: 5,52/kg × 85kg = R$469,20/chapa
    expect(rkgCru(5.52, null, null) * 85).toBeCloseTo(469.2, 1);
  });
});
