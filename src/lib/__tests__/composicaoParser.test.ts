import { describe, it, expect } from "vitest";
import {
  parseComposicaoFromPositionedItems,
  agregarPorCodigo,
} from "@/lib/composicaoParser";
import type { PDFTextItem } from "@/lib/parsers";

function item(str: string, x: number, y: number): PDFTextItem {
  return { str, x, y, width: 0 };
}

// componente=50, descricao=200, qtde=500, um=600
function header(y: number): PDFTextItem[] {
  return [
    item("Componente", 50, y),
    item("Descrição do Componente", 200, y),
    item("Qtde Necessária", 500, y),
    item("UM", 600, y),
    item("Imagem", 680, y),
  ];
}

describe("parseComposicaoFromPositionedItems", () => {
  it("extrai código, quantidade e cabeçalho; soma duplicados", () => {
    const page: PDFTextItem[] = [
      item("Código do Produto:", 50, 5),
      item("V5P", 200, 5),
      item("Descrição do produto:", 350, 5),
      item("APARELHO V5 PLUS SEM TORRE", 520, 5),
      ...header(20),
      item("MOF.V5.020", 50, 40),
      item("MONTAGEM PLATAFORMA", 200, 40),
      item("1,00", 500, 40),
      item("PÇ", 600, 40),
      // código com espaço
      item("SXT.10X20", 50, 55),
      item("5.8", 95, 55),
      item("PA SX AC MA 5.8 10X20 RI ZB", 200, 55),
      item("2,00", 500, 55),
      item("CE", 600, 55),
      // duplicado CO.069 (0,10 + 0,10 = 0,20)
      item("CO.069", 50, 70),
      item("TINTA PO PRETO", 200, 70),
      item("0,10", 500, 70),
      item("KG", 600, 70),
      item("CO.069", 50, 85),
      item("TINTA PO PRETO", 200, 85),
      item("0,10", 500, 85),
      item("KG", 600, 85),
    ];

    const result = parseComposicaoFromPositionedItems([page]);
    expect(result.produtoCodigo).toBe("V5P");
    expect(result.produtoDescricao).toContain("APARELHO V5 PLUS");
    expect(result.produtoGrupo).toBeNull(); // página sintética não tem rótulo de grupo
    expect(result.itens).toHaveLength(4);

    const agg = agregarPorCodigo(result.itens);
    const co = agg.find((i) => i.codigo.toUpperCase() === "CO.069");
    expect(co?.quantidade).toBeCloseTo(0.2, 5);
    const sxt = agg.find((i) => i.codigo === "SXT.10X20 5.8");
    expect(sxt?.quantidade).toBe(2);
    expect(agg).toHaveLength(3);
  });

  it("ignora linhas sem código ou sem quantidade (cabeçalhos/rodapés)", () => {
    const page: PDFTextItem[] = [
      ...header(20),
      item("Página 1 de 11", 50, 200),
      item("MOF.V5.020", 50, 40),
      item("MONTAGEM", 200, 40),
      item("1,00", 500, 40),
      item("PÇ", 600, 40),
    ];
    const result = parseComposicaoFromPositionedItems([page]);
    expect(result.itens).toHaveLength(1);
    expect(result.itens[0].codigo).toBe("MOF.V5.020");
  });
});
