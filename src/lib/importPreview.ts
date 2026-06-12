import type { InvoiceItem } from "@/lib/parsers";

export type Origem = "xml" | "pdf";

/** A single editable preview line derived from a parsed invoice item. */
export interface PreviewRow {
  id: string;
  cprod: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
  quantidade: number;
  data_emissao: string; // yyyy-mm-dd
  fornecedor: string;
}

/** A parsed nota (file) grouping its preview rows. */
export interface PreviewNota {
  id: string;
  arquivo_nome: string;
  origem: Origem;
  numero?: string;
  fornecedor: string;
  data_emissao: string; // yyyy-mm-dd
  rows: PreviewRow[];
}

/** Returns today's date as yyyy-mm-dd (local). */
export function todayISO(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

let _seq = 0;
function nextId(prefix: string): string {
  _seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${_seq}`;
}

/**
 * Pure mapping of a parsed InvoiceItem to an editable preview row.
 * `hoje` is the fallback emission date (yyyy-mm-dd) when the item has none.
 */
export function invoiceItemToPreviewRow(
  item: InvoiceItem,
  _origem: Origem,
  _arquivoNome: string,
  hoje: string,
): PreviewRow {
  return {
    id: nextId("row"),
    cprod: item.code ?? "",
    descricao: item.description ?? "",
    unidade: item.unit ?? "",
    custo_unitario: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
    quantidade: Number.isFinite(item.quantity) ? item.quantity : 1,
    data_emissao: item.emissionDate || hoje,
    fornecedor: item.supplier ?? "",
  };
}

/** Build a PreviewNota from parsed invoice items for one file. */
export function buildPreviewNota(
  items: InvoiceItem[],
  origem: Origem,
  arquivoNome: string,
  hoje: string,
): PreviewNota {
  const rows = items.map((it) => invoiceItemToPreviewRow(it, origem, arquivoNome, hoje));
  // Derive nota-level fornecedor/data from the first row that has them.
  const fornecedor = rows.find((r) => r.fornecedor)?.fornecedor ?? "";
  const data_emissao = rows.find((r) => r.data_emissao)?.data_emissao ?? hoje;
  return {
    id: nextId("nota"),
    arquivo_nome: arquivoNome,
    origem,
    fornecedor,
    data_emissao,
    rows,
  };
}
