import { describe, it, expect } from "vitest";
import { casarNoCatalogo } from "@/lib/criarProdutoDaFicha";
import type { ComposicaoItem } from "@/lib/composicaoParser";

function item(codigo: string, quantidade: number, descricao = ""): ComposicaoItem {
  return { codigo, descricao, quantidade };
}

describe("casarNoCatalogo", () => {
  const catalogo = [
    { id: "id-la", codigo: "LA.001" },
    { id: "id-co", codigo: "co.069" }, // catálogo com caixa baixa também casa
    { id: "id-sem-codigo", codigo: null },
  ];

  it("casa por código normalizado (maiúsculas/trim) e separa não encontrados", () => {
    const itens = [
      item("la.001", 2, "LAMINA"),
      item(" CO.069 ", 0.5, "TINTA PO PRETO"),
      item("US.999", 1, "NAO EXISTE"),
    ];
    const r = casarNoCatalogo(itens, catalogo);
    expect(r.encontrados).toEqual([
      { componenteId: "id-la", quantidade: 2, codigo: "la.001" },
      { componenteId: "id-co", quantidade: 0.5, codigo: " CO.069 " },
    ]);
    expect(r.naoEncontrados).toHaveLength(1);
    expect(r.naoEncontrados[0].codigo).toBe("US.999");
  });

  it("catálogo vazio → tudo não encontrado", () => {
    const r = casarNoCatalogo([item("LA.001", 1)], []);
    expect(r.encontrados).toEqual([]);
    expect(r.naoEncontrados).toHaveLength(1);
  });

  it("itens vazios → resultado vazio", () => {
    expect(casarNoCatalogo([], catalogo)).toEqual({ encontrados: [], naoEncontrados: [] });
  });
});
