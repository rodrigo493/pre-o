import { describe, it, expect } from "vitest";
import { montarLinhasExport } from "@/lib/exportXlsx";
import type { LinhaProduto } from "@/hooks/useProdutosResolvidos";

const linha: LinhaProduto = {
  id: "1", nome: "Parafuso", categoria: "Fixação", tipo: "comprado",
  custoManual: null, precoManual: null,
  resolvido: { precoVenda: 100, custoBase: 50, margemPercent: 50, status: "ok",
    origem: { notaId: "n1", notaNumero: "123", dataEmissao: "2026-05-01" }, numNotasPeriodo: 2 },
};

describe("montarLinhasExport", () => {
  it("mapeia colunas pt-BR", () => {
    const [row] = montarLinhasExport([linha]);
    expect(row).toMatchObject({
      Produto: "Parafuso", Categoria: "Fixação", "Maior custo": 50,
      "Preço venda": 100, "Data do custo": "2026-05-01", "Nº notas no período": 2,
    });
  });
});
