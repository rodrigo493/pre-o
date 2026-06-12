import { describe, it, expect } from "vitest";
import { parseVinculoLista } from "@/lib/vinculoBulk";
import { construirMapaCodigo } from "@/lib/autoLink";

const mapa = construirMapaCodigo([
  { id: "p1", codigo: "CH.LISA.1200X3000X3,00MM" },
  { id: "p2", codigo: "CH.LISA.1500X3000X4,75MM" },
]);

describe("parseVinculoLista", () => {
  it("lê pares cProd<TAB>código", () => {
    const r = parseVinculoLista(
      "1218120030-W\tCH.LISA.1200X3000X3,00MM\n1448150030-W\tCH.LISA.1500X3000X4,75MM",
      mapa,
    );
    expect(r.invalidas).toHaveLength(0);
    expect(r.pares).toEqual([
      { cprod: "1218120030-W", codigo: "CH.LISA.1200X3000X3,00MM", produtoId: "p1" },
      { cprod: "1448150030-W", codigo: "CH.LISA.1500X3000X4,75MM", produtoId: "p2" },
    ]);
  });

  it("acha o código em tabela com várias colunas (cola do Nomus)", () => {
    const linha =
      "1218120030-W - CHP FQ 3,00 X 1200 X 3000\tCHAPA A36 1200x3000x3,00MM\tCH.LISA.1200X3000X3,00MM";
    const r = parseVinculoLista(linha, mapa);
    expect(r.pares).toEqual([
      { cprod: "1218120030-W", codigo: "CH.LISA.1200X3000X3,00MM", produtoId: "p1" },
    ]);
  });

  it("marca inválida quando o código não está no catálogo", () => {
    const r = parseVinculoLista("ABC\tCODIGO.INEXISTENTE", mapa);
    expect(r.pares).toHaveLength(0);
    expect(r.invalidas).toHaveLength(1);
  });

  it("dedupe por cProd e ignora linhas vazias", () => {
    const r = parseVinculoLista(
      "1218120030-W\tCH.LISA.1200X3000X3,00MM\n\n1218120030-W\tCH.LISA.1200X3000X3,00MM",
      mapa,
    );
    expect(r.pares).toHaveLength(1);
  });
});
