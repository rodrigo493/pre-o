import { describe, it, expect } from "vitest";
import { diceScore, bestMatch } from "@/lib/fuzzyMatch";

describe("diceScore", () => {
  it("1 para textos iguais (ignorando acento/caixa)", () => {
    expect(diceScore("Chapa Lisa 2,0mm", "CHAPA LISA 2.0MM")).toBeGreaterThan(0.9);
  });
  it("0 quando não há tokens em comum", () => {
    expect(diceScore("parafuso allen", "tubo redondo")).toBe(0);
  });
});

describe("bestMatch", () => {
  const candidatos = [
    { id: "1", text: "CHAPA LISA 1200X3000X2,0MM" },
    { id: "2", text: "TUBO RED TLH SE ST 35 16X10X3MM" },
    { id: "3", text: "PARAFUSO SEXTAVADO 6X20" },
  ];

  it("encontra o melhor candidato acima do limiar", () => {
    const r = bestMatch("CHAPA LISA 2,0MM", candidatos, 0.3);
    expect(r?.id).toBe("1");
  });

  it("retorna null quando nada passa do limiar", () => {
    expect(bestMatch("MOTOR ELETRICO 5CV", candidatos, 0.4)).toBeNull();
  });
});
