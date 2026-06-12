import { describe, it, expect } from "vitest";
import {
  parseComposicaoFromPositionedItems,
  agregarPorCodigo,
} from "@/lib/composicaoParser";
import type { PDFTextItem } from "@/lib/parsers";
import { separarComposicao } from "@/lib/composicaoClassify";
import real from "./fixtures/v5plus-real.json";

describe("composicaoParser — ficha técnica real (V5 PLUS)", () => {
  it("lê os componentes do PDF real e soma duplicados", () => {
    const r = parseComposicaoFromPositionedItems(real as PDFTextItem[][]);
    expect(r.itens.length).toBeGreaterThan(50);

    const agg = agregarPorCodigo(r.itens);
    // Tinta CO.069 aparece várias vezes ao longo da ficha → soma > 1 ocorrência.
    const co = agg.find((i) => i.codigo.toUpperCase() === "CO.069");
    expect(co).toBeTruthy();
    expect(co!.quantidade).toBeGreaterThan(1);

    // Códigos com espaço e com vírgula são lidos corretamente.
    expect(agg.some((i) => i.codigo === "SXT.10X20 5.8")).toBe(true);
    expect(agg.some((i) => i.codigo === "FRM.TRE.4,76MM")).toBe(true);
  });

  it("extrai o cabeçalho por posição: código, descrição e grupo", () => {
    const r = parseComposicaoFromPositionedItems(real as PDFTextItem[][]);
    expect(r.produtoCodigo).toBe("V5P"); // antes saía "Descri"
    expect(r.produtoDescricao).toBe("APARELHO V5 PLUS SEM TORRE");
    expect(r.produtoGrupo).toBe("01 - PRODUTO ACABADO");
  });

  it("classificação estável no PDF real: 244 únicos = 67 fabricados + 177 matérias-primas", () => {
    const r = parseComposicaoFromPositionedItems(real as PDFTextItem[][]);
    const agg = agregarPorCodigo(r.itens);
    expect(agg).toHaveLength(244);
    const { materiaPrima, fabricados } = separarComposicao(agg);
    expect(fabricados).toHaveLength(67);
    expect(materiaPrima).toHaveLength(177);
  });
});
