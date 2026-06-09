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

// Layout: codigo=50, descricao=200, um=320, um2=400, tipo=470, grupo=540, familia=600, ressup=660
function header(y: number): PDFTextItem[] {
  return [
    item("Código do produto", 50, y),
    item("Cód. Secundário", 130, y),
    item("Descrição", 200, y),
    item("U.M.", 320, y),
    item("U.M. Secundária", 400, y),
    item("Tipo de produto", 470, y),
    item("Grupo de produto", 540, y),
    item("Família", 600, y),
    item("Ressuprimento", 660, y),
  ];
}

describe("parseCatalogFromPositionedItems", () => {
  it("extrai código, descrição, unidades, tipo e grupo (categoria)", () => {
    const page: PDFTextItem[] = [
      ...header(10),
      // Produto 1 — descrição e grupo em várias linhas
      item("MUC.672", 50, 30),
      item("Manilha Reta Para", 200, 30),
      item("UNIDADE", 320, 30),
      item("Uso e consumo", 470, 30),
      item("05 - MATERIAL DE", 540, 30),
      item("Comprado", 660, 30),
      item("Cabo de aço 3/4", 200, 45),
      item("USO E CONSUMO", 540, 45),
      item("Vonder Plus", 200, 60),
      // Produto 2 — com unidade secundária, grupo CHAPA
      item("CH.LISA.2,0", 50, 90),
      item("CHAPA LISA 2,0MM", 200, 90),
      item("UNIDADE", 320, 90),
      item("QUILOGRAMA", 400, 90),
      item("Matéria prima", 470, 90),
      item("34 - CHAPA", 540, 90),
      item("Comprado", 660, 90),
      // Produto 3 — fabricado → montado
      item("KIT.V5", 50, 120),
      item("ACESSÓRIO JUMP", 200, 120),
      item("UNIDADE", 320, 120),
      item("01 - PRODUTO ACABADO", 540, 120),
      item("Fabricado", 660, 120),
    ];

    const result = parseCatalogFromPositionedItems([page]);
    expect(result).toEqual<CatalogProduct[]>([
      {
        codigo: "MUC.672",
        nome: "Manilha Reta Para Cabo de aço 3/4 Vonder Plus",
        unidade: "UNIDADE",
        unidadeSecundaria: null,
        tipo: "comprado",
        categoria: "05 - MATERIAL DE USO E CONSUMO",
      },
      {
        codigo: "CH.LISA.2,0",
        nome: "CHAPA LISA 2,0MM",
        unidade: "UNIDADE",
        unidadeSecundaria: "QUILOGRAMA",
        tipo: "comprado",
        categoria: "34 - CHAPA",
      },
      {
        codigo: "KIT.V5",
        nome: "ACESSÓRIO JUMP",
        unidade: "UNIDADE",
        unidadeSecundaria: null,
        tipo: "montado",
        categoria: "01 - PRODUTO ACABADO",
      },
    ]);
  });

  it("trata descrição que quebra na virada de página", () => {
    const page1: PDFTextItem[] = [
      ...header(10),
      item("MUC.670", 50, 30),
      item("TEE MACHO", 200, 30),
      item("UNIDADE", 320, 30),
      item("05 - USO", 540, 30),
      item("Comprado", 660, 30),
    ];
    const page2: PDFTextItem[] = [
      ...header(10),
      item("LATER.GIRAT. 10X1/4 NPT", 200, 30),
      item("MUC.669", 50, 60),
      item("NIPLE REDUÇÃO", 200, 60),
      item("UNIDADE", 320, 60),
      item("Comprado", 660, 60),
    ];

    const result = parseCatalogFromPositionedItems([page1, page2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      codigo: "MUC.670",
      nome: "TEE MACHO LATER.GIRAT. 10X1/4 NPT",
      categoria: "05 - USO",
    });
    expect(result[1]).toMatchObject({ codigo: "MUC.669", nome: "NIPLE REDUÇÃO" });
  });

  it("classifica como montado por prefixo de código (US/LA/MO/MOF/TB) mesmo se Ressuprimento=Comprado", () => {
    const page: PDFTextItem[] = [
      ...header(10),
      item("US.100", 50, 30),
      item("EIXO USINADO", 200, 30),
      item("UNIDADE", 320, 30),
      item("Matéria prima", 470, 30),
      item("08 - CORTE", 540, 30),
      item("Comprado", 660, 30),
    ];
    const result = parseCatalogFromPositionedItems([page]);
    expect(result[0]).toMatchObject({ codigo: "US.100", tipo: "montado" });
  });

  it("ignora linhas sem código ou sem descrição", () => {
    const page: PDFTextItem[] = [
      ...header(10),
      item("SO.CODIGO", 50, 30),
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
        categoria: null,
      },
    ]);
  });
});

describe("dedupeCatalog", () => {
  it("remove duplicados por código mantendo o último", () => {
    const dup: CatalogProduct[] = [
      { codigo: "A", nome: "Antigo", unidade: null, unidadeSecundaria: null, tipo: "comprado", categoria: null },
      { codigo: "B", nome: "Bê", unidade: null, unidadeSecundaria: null, tipo: "comprado", categoria: null },
      { codigo: "A", nome: "Novo", unidade: "KG", unidadeSecundaria: null, tipo: "comprado", categoria: "X" },
    ];
    const result = dedupeCatalog(dup);
    expect(result).toHaveLength(2);
    expect(result.find((p) => p.codigo === "A")?.nome).toBe("Novo");
  });
});
