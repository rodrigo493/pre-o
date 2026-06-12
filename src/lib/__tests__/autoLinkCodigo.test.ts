import { describe, it, expect } from "vitest";
import { construirMapaCodigo, aplicarAutoVinculoPorCodigo } from "@/lib/autoLink";

describe("auto-vínculo por código", () => {
  const mapa = construirMapaCodigo([
    { id: "p1", codigo: "CH.LISA.1200X3000X3,00MM" },
    { id: "p2", codigo: "CO.069" },
    { id: "p3", codigo: null },
    { id: "p4", codigo: "  " },
  ]);

  it("vincula quando o cProd é igual ao código", () => {
    const r = aplicarAutoVinculoPorCodigo(
      [{ id: "i1", cprod: "CH.LISA.1200X3000X3,00MM", descricao: "CHAPA LISA" }],
      mapa,
    );
    expect(r.vinculados).toEqual([{ id: "i1", produtoMestreId: "p1" }]);
    expect(r.pendentes).toHaveLength(0);
  });

  it("tolera caixa e espaços no cProd", () => {
    const r = aplicarAutoVinculoPorCodigo(
      [{ id: "i1", cprod: " ch.lisa.1200x3000x3,00 mm ", descricao: "" }],
      mapa,
    );
    expect(r.vinculados[0]?.produtoMestreId).toBe("p1");
  });

  it("vincula quando o código aparece como token na descrição", () => {
    const r = aplicarAutoVinculoPorCodigo(
      [{ id: "i1", cprod: "FORN-XYZ", descricao: "TINTA CO.069 PRETA" }],
      mapa,
    );
    expect(r.vinculados[0]?.produtoMestreId).toBe("p2");
  });

  it("deixa pendente quando nada casa", () => {
    const r = aplicarAutoVinculoPorCodigo(
      [{ id: "i1", cprod: "ABC", descricao: "PARAFUSO QUALQUER" }],
      mapa,
    );
    expect(r.vinculados).toHaveLength(0);
    expect(r.pendentes).toHaveLength(1);
  });

  it("ignora códigos nulos/vazios no mapa", () => {
    expect(mapa.has("")).toBe(false);
  });
});
