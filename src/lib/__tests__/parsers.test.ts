import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseInvoiceFromXML } from "@/lib/parsers";

const xml = readFileSync(
  resolve(__dirname, "fixtures/nfe-exemplo.xml"), "utf-8"
);

describe("parseInvoiceFromXML — NF-e", () => {
  it("extrai os 2 itens com código, descrição e custo unitário", () => {
    const items = parseInvoiceFromXML(xml);
    expect(items).toHaveLength(2);
    const p1 = items[0];
    expect(p1.code).toBe("ABC-001");
    expect(p1.description).toBe("PARAFUSO SEXTAVADO M8");
    expect(p1.unitPrice).toBeCloseTo(2.5, 4);
    expect(p1.quantity).toBeCloseTo(100, 4);
    expect(p1.unit).toBe("UN");
  });

  it("extrai data de emissão e fornecedor", () => {
    const items = parseInvoiceFromXML(xml);
    expect(items[0].emissionDate).toBe("2026-03-15");
    expect(items[0].supplier).toBe("FORNECEDOR EXEMPLO LTDA");
  });

  it("descarta item sem preço (>0)", () => {
    const semPreco = xml.replace("<vUnCom>2.5000</vUnCom>", "<vUnCom>0</vUnCom>");
    const items = parseInvoiceFromXML(semPreco);
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe("ABC-002");
  });
});
