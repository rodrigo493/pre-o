import { describe, it, expect } from "vitest";
import { converterCusto, normalizeUnidade } from "@/lib/unitConvert";

describe("normalizeUnidade", () => {
  it("remove acento, espaço e caixa", () => {
    expect(normalizeUnidade(" Peça ")).toBe("PECA");
    expect(normalizeUnidade("QUILOGRAMA")).toBe("QUILOGRAMA");
    expect(normalizeUnidade(null)).toBe("");
  });
});

describe("converterCusto", () => {
  const chapa = { unidade: "UNIDADE", unidadeSecundaria: "QUILOGRAMA", fatorConversao: 47.1 };

  it("converte kg → peça usando o fator", () => {
    const r = converterCusto(8.5, "QUILOGRAMA", chapa);
    expect(r.convertido).toBe(true);
    expect(r.pendente).toBe(false);
    expect(r.custo).toBeCloseTo(400.35, 2);
  });

  it("não converte quando a unidade da nota é a principal", () => {
    const r = converterCusto(400, "UNIDADE", chapa);
    expect(r).toEqual({ custo: 400, convertido: false, pendente: false });
  });

  it("marca pendente quando casa com a secundária mas falta fator", () => {
    const semFator = { unidade: "UNIDADE", unidadeSecundaria: "QUILOGRAMA", fatorConversao: null };
    const r = converterCusto(8.5, "QUILOGRAMA", semFator);
    expect(r).toEqual({ custo: 8.5, convertido: false, pendente: true });
  });

  it("marca pendente quando a unidade diverge e não casa com a secundária", () => {
    const r = converterCusto(8.5, "METRO", chapa);
    expect(r).toEqual({ custo: 8.5, convertido: false, pendente: true });
  });

  it("não converte quando não há unidade na nota ou no produto", () => {
    expect(converterCusto(10, null, chapa).pendente).toBe(false);
    expect(converterCusto(10, "KG", { unidade: null }).pendente).toBe(false);
  });
});
