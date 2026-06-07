import { describe, it, expect } from "vitest";
import { aplicarAutoVinculo, type Vinculo } from "@/lib/autoLink";

const vinculos: Vinculo[] = [
  { cprod: "ABC-001", produtoMestreId: "m1" },
  { cprod: "ABC-002", produtoMestreId: "m2" },
];

describe("aplicarAutoVinculo", () => {
  it("vincula item cujo cprod já é conhecido (case-insensitive)", () => {
    const r = aplicarAutoVinculo([{ id: "i1", cprod: "abc-001" }], vinculos);
    expect(r.vinculados).toEqual([{ id: "i1", cprod: "abc-001", produtoMestreId: "m1" }]);
    expect(r.pendentes).toHaveLength(0);
  });

  it("deixa item desconhecido na fila de pendentes", () => {
    const r = aplicarAutoVinculo([{ id: "i9", cprod: "NOVO-999" }], vinculos);
    expect(r.vinculados).toHaveLength(0);
    expect(r.pendentes).toEqual([{ id: "i9", cprod: "NOVO-999" }]);
  });

  it("separa lote misto em vinculados e pendentes", () => {
    const r = aplicarAutoVinculo(
      [{ id: "i1", cprod: "ABC-001" }, { id: "i9", cprod: "X" }],
      vinculos,
    );
    expect(r.vinculados.map((v) => v.id)).toEqual(["i1"]);
    expect(r.pendentes.map((p) => p.id)).toEqual(["i9"]);
  });
});
