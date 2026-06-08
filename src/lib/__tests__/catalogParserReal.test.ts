import { describe, it, expect } from "vitest";
import { parseCatalogFromPositionedItems } from "@/lib/catalogParser";
import type { PDFTextItem } from "@/lib/parsers";
import real from "./fixtures/nomus-real.json";

describe("catalogParser — PDF real do Nomus", () => {
  it("reconhece produtos no PDF real", () => {
    const pages = real as Array<Array<PDFTextItem>>;
    const result = parseCatalogFromPositionedItems(pages);
    // eslint-disable-next-line no-console
    console.log("produtos reconhecidos:", result.length, result.slice(0, 5));
    expect(result.length).toBeGreaterThan(0);
  });
});
