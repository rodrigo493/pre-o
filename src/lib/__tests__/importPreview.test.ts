import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseInvoiceFromXML } from "@/lib/parsers";
import {
  invoiceItemToPreviewRow,
  buildPreviewNota,
  todayISO,
} from "@/lib/importPreview";

const xml = readFileSync(resolve(__dirname, "fixtures/nfe-exemplo.xml"), "utf-8");

describe("importPreview — mapeamento item → linha", () => {
  it("mapeia um InvoiceItem para uma linha editável", () => {
    const [item] = parseInvoiceFromXML(xml);
    const row = invoiceItemToPreviewRow(item, "xml", "nfe-exemplo.xml", "2026-06-07");
    expect(row).toMatchObject({
      cprod: "ABC-001",
      descricao: "PARAFUSO SEXTAVADO M8",
      unidade: "UN",
      custo_unitario: item.unitPrice,
      quantidade: item.quantity,
      data_emissao: "2026-03-15",
      fornecedor: "FORNECEDOR EXEMPLO LTDA",
    });
    expect(row.id).toBeTruthy();
  });

  it("usa hoje como data quando o item não tem emissionDate", () => {
    const row = invoiceItemToPreviewRow(
      { code: "X", description: "Y", unitPrice: 10, quantity: 1, unit: "UN" },
      "pdf",
      "nf.pdf",
      "2026-06-07",
    );
    expect(row.data_emissao).toBe("2026-06-07");
    expect(row.fornecedor).toBe("");
  });

  it("agrupa itens numa nota com fornecedor e data derivados", () => {
    const items = parseInvoiceFromXML(xml);
    const nota = buildPreviewNota(items, "xml", "nfe-exemplo.xml", "2026-06-07");
    expect(nota.rows).toHaveLength(2);
    expect(nota.arquivo_nome).toBe("nfe-exemplo.xml");
    expect(nota.origem).toBe("xml");
    expect(nota.fornecedor).toBe("FORNECEDOR EXEMPLO LTDA");
    expect(nota.data_emissao).toBe("2026-03-15");
  });

  it("todayISO formata yyyy-mm-dd", () => {
    expect(todayISO(new Date(2026, 5, 7))).toBe("2026-06-07");
    expect(todayISO(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});
