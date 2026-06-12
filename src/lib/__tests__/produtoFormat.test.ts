import { describe, it, expect } from "vitest";
import { formatMargem, formatMoeda, formatOrigem } from "@/lib/produtoFormat";

describe("formatMoeda", () => {
  it("retorna travessão para null", () => {
    expect(formatMoeda(null)).toBe("—");
  });
  it("formata valores em BRL", () => {
    expect(formatMoeda(100)).toContain("100");
  });
});

describe("formatMargem", () => {
  it("retorna travessão para null", () => {
    expect(formatMargem(null)).toBe("—");
  });
  it("formata com 1 casa decimal e %", () => {
    expect(formatMargem(50)).toBe("50.0%");
    expect(formatMargem(33.333)).toBe("33.3%");
  });
});

describe("formatOrigem", () => {
  it("retorna travessão sem origem", () => {
    expect(formatOrigem(null)).toBe("—");
  });
  it("usa número da nota quando presente", () => {
    expect(
      formatOrigem({ notaId: "n1", notaNumero: "123", dataEmissao: "2026-05-01" }),
    ).toBe("nº 123 · 2026-05-01");
  });
  it("cai para 'nota' sem número", () => {
    expect(
      formatOrigem({ notaId: "n1", dataEmissao: "2026-05-01" }),
    ).toBe("nota · 2026-05-01");
  });
});
