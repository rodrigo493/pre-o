import { describe, it, expect } from "vitest";
import {
  parseCatalogFromPositionedItems,
  dedupeCatalog,
  type CatalogProduct,
} from "@/lib/catalogParser";
import type { PDFTextItem } from "@/lib/parsers";

function item(str: string, x: number, y: number): PDFTextItem {
  return { str, x, y, width: 0 };
}

// Layout: codigo=50, descricao=200, um=320, um2=400, tipo=470, ressup=650
function header(y: number): PDFTextItem[] {
  return [
    item("Código do produto", 50, y),
    item("Cód. Secundário", 130, y),
    item("Descrição", 200, y),
    item("U.M.", 320, y),
    item("U.M. Secundária", 400, y),
    item("Tipo de produto", 470, y),
    item("Ressuprimento", 650, y),
  ];
}

describe("parseCatalogFromPositionedItems", () => {
  it("extrai código, descrição multilinha, unidades e tipo", () => {
    const page: PDFTextItem[] = [
      ...header(10),
      // Produto 1 — descrição em 3 linhas, sem unidade secundária, comprado
      item("MUC.672", 50, 30),
      item("Manilha Reta Para", 200, 30),
      item("UNIDADE", 320, 30),
      item("Uso e consumo", 470, 30),
      item("Comprado", 650, 30),
      item("Cabo de aço 3/4", 200, 45),
      item("Vonder Plus", 200, 60),
      // Produto 2 — com unidade secundária, comprado
      item("CH.LISA.2,0", 50, 90),
      item("CHAPA LISA 2,0MM", 200, 90),
      item("UNIDADE", 320, 90),
      item("QUILOGRAMA", 400, 90),
      item("Matéria prima", 470, 90),
      item("Comprado", 650, 90),
      // Produto 3 — fabricado → montado
      item("KIT.V5", 50, 120),
      item("ACESSÓRIO JUMP", 200, 120),
      item("UNIDADE", 320, 120),
      item("QUILOGRAMA", 400, 120),
      item("Fabricado", 650, 120),
    ];

    const result = parseCatalogFromPositionedItems([page]);
    expect(result).toEqual<CatalogProduct[]>([
      {
        codigo: "MUC.672",
        nome: "Manilha Reta Para Cabo de aço 3/4 Vonder Plus",
        unidade: "UNIDADE",
        unidadeSecundaria: null,
        tipo: "comprado",
      },
      {
        codigo: "CH.LISA.2,0",
        nome: "CHAPA LISA 2,0MM",
        unidade: "UNIDADE",
        unidadeSecundaria: "QUILOGRAMA",
        tipo: "comprado",
      },
      {
        codigo: "KIT.V5",
        nome: "ACESSÓRIO JUMP",
        unidade: "UNIDADE",
        unidadeSecundaria: "QUILOGRAMA",
        tipo: "montado",
      },
    ]);
  });

  it("trata descrição que quebra na virada de página", () => {
    const page1: PDFTextItem[] = [
      ...header(10),
      item("MUC.670", 50, 30),
      item("TEE MACHO", 200, 30),
      item("UNIDADE", 320, 30),
      item("Comprado", 650, 30),
    ];
    const page2: PDFTextItem[] = [
      ...header(10),
      // continuação (sem código) do produto da página anterior
      item("LATER.GIRAT. 10X1/4 NPT", 200, 30),
      item("consumo", 470, 30),
      // próximo produto
      item("MUC.669", 50, 60),
      item("NIPLE REDUÇÃO", 200, 60),
      item("UNIDADE", 320, 60),
      item("Comprado", 650, 60),
    ];

    const result = parseCatalogFromPositionedItems([page1, page2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      codigo: "MUC.670",
      nome: "TEE MACHO LATER.GIRAT. 10X1/4 NPT",
    });
    expect(result[1]).toMatchObject({ codigo: "MUC.669", nome: "NIPLE REDUÇÃO" });
  });

  it("ignora linhas sem código ou sem descrição", () => {
    const page: PDFTextItem[] = [
      ...header(10),
      item("SO.CODIGO", 50, 30), // sem descrição → ignorado
      item("OK.1", 50, 60),
      item("Produto válido", 200, 60),
    ];
    const result = parseCatalogFromPositionedItems([page]);
    expect(result).toEqual([
      {
        codigo: "OK.1",
        nome: "Produto válido",
        unidade: null,
        unidadeSecundaria: null,
        tipo: "comprado",
      },
    ]);
  });
});

describe("dedupeCatalog", () => {
  it("remove duplicados por código mantendo o último", () => {
    const dup: CatalogProduct[] = [
      { codigo: "A", nome: "Antigo", unidade: null, unidadeSecundaria: null, tipo: "comprado" },
      { codigo: "B", nome: "Bê", unidade: null, unidadeSecundaria: null, tipo: "comprado" },
      { codigo: "A", nome: "Novo", unidade: "KG", unidadeSecundaria: null, tipo: "comprado" },
    ];
    const result = dedupeCatalog(dup);
    expect(result).toHaveLength(2);
    expect(result.find((p) => p.codigo === "A")?.nome).toBe("Novo");
  });
});
