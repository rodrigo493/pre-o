import { describe, it, expect } from "vitest";
import {
  parseComposicaoFromPositionedItems,
  agregarPorCodigo,
} from "@/lib/composicaoParser";
import type { PDFTextItem } from "@/lib/parsers";
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
});
