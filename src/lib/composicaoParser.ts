import {
  extractPositionedTextFromPDF,
  readFileAsArrayBuffer,
  type PDFTextItem,
} from "@/lib/parsers";

export interface ComposicaoItem {
  codigo: string;
  descricao: string;
  quantidade: number;
}

export interface ComposicaoResult {
  produtoCodigo: string | null;
  produtoDescricao: string | null;
  itens: ComposicaoItem[];
}

/** "1.234,56" → 1234.56 ; "0,03" → 0.03 */
function parseBRNumber(str: string): number {
  const cleaned = str.trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function isNumericToken(str: string): boolean {
  const t = str.trim();
  return t !== "" && /^[\d.,]+$/.test(t);
}

interface Anchors {
  componenteX: number;
  descricaoX: number;
  qtdeX: number;
  umX: number;
}

function groupRows(items: PDFTextItem[]): Array<Array<{ str: string; x: number }>> {
  const map = new Map<number, Array<{ str: string; x: number }>>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.y / 3) * 3;
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push({ str: it.str.trim(), x: it.x });
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, cells]) => cells.sort((a, b) => a.x - b.x));
}

function findAnchors(rows: Array<Array<{ str: string; x: number }>>): Anchors | null {
  for (const cells of rows) {
    const joined = cells.map((c) => c.str).join(" ");
    if (!/Componente/.test(joined) || !/Qtde/.test(joined)) continue;

    // "Componente" (coluna 1) é a ocorrência mais à esquerda.
    const compCells = cells.filter((c) => /Componente/.test(c.str)).sort((a, b) => a.x - b.x);
    const descricao = cells.filter((c) => /Descri/.test(c.str)).sort((a, b) => a.x - b.x)[0];
    const qtde = cells.find((c) => /Qtde/.test(c.str));
    const um = cells
      .filter((c) => /^UM$/i.test(c.str.trim()) || /^U\.?M/i.test(c.str.trim()))
      .sort((a, b) => a.x - b.x)
      .find((c) => qtde && c.x > qtde.x);
    if (compCells.length === 0 || !descricao || !qtde) continue;

    return {
      componenteX: compCells[0].x,
      descricaoX: descricao.x,
      qtdeX: qtde.x,
      umX: um ? um.x : qtde.x + 120,
    };
  }
  return null;
}

function extrairCabecalho(rows: Array<Array<{ str: string; x: number }>>): {
  codigo: string | null;
  descricao: string | null;
} {
  const texto = rows.map((cells) => cells.map((c) => c.str).join(" ")).join("\n");
  const cod = texto.match(/Código do Produto:\s*([A-Za-z0-9.\-/]+)/i);
  const desc = texto.match(/Descrição do produto:\s*(.+)/i);
  return {
    codigo: cod ? cod[1].trim() : null,
    descricao: desc ? desc[1].trim() : null,
  };
}

/**
 * Parse a "Ficha Técnica do Produto" (lista de materiais) do Nomus.
 * Tabela plana: Componente | Descrição | Qtde Necessária | UM. Cada linha com
 * código (coluna Componente) + quantidade numérica (coluna Qtde) vira item.
 */
export function parseComposicaoFromPositionedItems(
  pages: Array<Array<PDFTextItem>>,
): ComposicaoResult {
  let anchors: Anchors | null = null;
  let cabecalho: { codigo: string | null; descricao: string | null } = {
    codigo: null,
    descricao: null,
  };
  const itens: ComposicaoItem[] = [];

  for (const pageItems of pages) {
    const rows = groupRows(pageItems);
    if (!anchors) {
      anchors = findAnchors(rows);
      cabecalho = extrairCabecalho(rows);
    }
    if (!anchors) continue;

    const codigoEnd = (anchors.componenteX + anchors.descricaoX) / 2;
    const qtdeStart = (anchors.descricaoX + anchors.qtdeX) / 2;
    const qtdeEnd = (anchors.qtdeX + anchors.umX) / 2;

    for (const cells of rows) {
      const codigoCells = cells.filter((c) => c.x < codigoEnd);
      const codigo = codigoCells.map((c) => c.str).join(" ").trim();
      if (!codigo || /Componente/i.test(codigo)) continue; // vazio ou cabeçalho

      const qtdeCell = cells
        .filter((c) => c.x >= qtdeStart && c.x < qtdeEnd && isNumericToken(c.str))
        .sort((a, b) => a.x - b.x)[0];
      if (!qtdeCell) continue;
      const quantidade = parseBRNumber(qtdeCell.str);
      if (!Number.isFinite(quantidade) || quantidade <= 0) continue;

      const descricao = cells
        .filter((c) => c.x >= codigoEnd && c.x < qtdeStart)
        .map((c) => c.str)
        .join(" ")
        .trim();

      itens.push({ codigo, descricao, quantidade });
    }
  }

  return { produtoCodigo: cabecalho.codigo, produtoDescricao: cabecalho.descricao, itens };
}

/** Soma quantidades de itens com o mesmo código (normalizado em maiúsculas). */
export function agregarPorCodigo(itens: ComposicaoItem[]): ComposicaoItem[] {
  const mapa = new Map<string, ComposicaoItem>();
  for (const it of itens) {
    const chave = it.codigo.trim().toUpperCase();
    const existente = mapa.get(chave);
    if (existente) existente.quantidade += it.quantidade;
    else mapa.set(chave, { ...it, codigo: it.codigo.trim() });
  }
  return Array.from(mapa.values());
}

export async function parseComposicaoFile(file: File): Promise<ComposicaoResult> {
  const buffer = await readFileAsArrayBuffer(file);
  const pages = await extractPositionedTextFromPDF(buffer);
  return parseComposicaoFromPositionedItems(pages);
}
