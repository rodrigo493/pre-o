import {
  extractPositionedTextFromPDF,
  readFileAsArrayBuffer,
  type PDFTextItem,
} from "@/lib/parsers";

export type CatalogTipo = "comprado" | "montado";

export interface CatalogProduct {
  codigo: string;
  nome: string;
  unidade: string | null;
  unidadeSecundaria: string | null;
  tipo: CatalogTipo;
  categoria: string | null; // "Grupo de produto" do Nomus (ex.: "34 - CHAPA")
}

/** Unidades de medida conhecidas no catálogo Nomus (normalizadas, sem acento). */
const KNOWN_UNITS = new Set([
  "UNIDADE",
  "PECA",
  "QUILOGRAMA",
  "KG",
  "TONELADA",
  "METRO",
  "MT",
  "M",
  "LITRO",
  "L",
  "BARRA",
  "CENTO",
  "MILHEIRO",
  "PAR",
  "UN",
  "PC",
  "CX",
  "CAIXA",
  "ROLO",
  "GRAMA",
]);

function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeUnit(raw: string): string {
  return stripAccents(raw.trim().toUpperCase()).replace(/\s+/g, "");
}

function isUnitLike(raw: string): boolean {
  return KNOWN_UNITS.has(normalizeUnit(raw));
}

/** Prefixos de código que indicam produto FABRICADO (montagem) na Live. */
const FABRICADO_PREFIXES = new Set(["TB", "MO", "MOF", "LA", "US"]);

/** Pega o prefixo alfabético inicial do código (antes de ponto/traço/número). */
function prefixoCodigo(codigo: string): string {
  const m = codigo.trim().toUpperCase().match(/^[A-ZÀ-Ý]+/);
  return m ? m[0] : "";
}

/** Decide o tipo: fabricado (montado) por prefixo de código OU "Fabricado" no Ressuprimento. */
function decidirTipo(codigo: string, ressupText: string): CatalogTipo {
  if (FABRICADO_PREFIXES.has(prefixoCodigo(codigo))) return "montado";
  if (/fabricado/i.test(ressupText)) return "montado";
  return "comprado";
}

interface ColumnAnchors {
  codigoX: number;
  descricaoX: number;
  umX: number;
  tipoX: number;
  grupoX: number | null;
  familiaX: number | null;
}

function findAnchors(rows: Array<Array<{ str: string; x: number }>>): ColumnAnchors | null {
  for (const cells of rows) {
    const joined = cells.map((c) => c.str).join(" ");
    if (!joined.includes("Código") || !/Descri/.test(joined)) continue;

    const codigo = cells.find((c) => c.str.includes("Código"));
    const descricao = cells.find((c) => /Descri/.test(c.str));
    // Primeiro "U.M." pela posição (a Secundária vem depois).
    const ums = cells.filter((c) => /^U\.?M\.?/i.test(c.str.trim())).sort((a, b) => a.x - b.x);
    const tipo = cells.find((c) => /^Tipo/.test(c.str.trim()));
    const grupo = cells.find((c) => /^Grupo/.test(c.str.trim()));
    const familia = cells.find((c) => /^Fam/.test(c.str.trim()));
    if (!codigo || !descricao || ums.length === 0 || !tipo) continue;

    return {
      codigoX: codigo.x,
      descricaoX: descricao.x,
      umX: ums[0].x,
      tipoX: tipo.x,
      grupoX: grupo ? grupo.x : null,
      familiaX: familia ? familia.x : null,
    };
  }
  return null;
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

function isHeaderRow(cells: Array<{ str: string; x: number }>): boolean {
  return cells.some((c) => c.str.includes("Código")) && cells.some((c) => /Descri/.test(c.str));
}

/**
 * Parse o relatório "Produtos | Nomus" a partir dos itens posicionados do PDF.
 * Mantém o produto pendente entre páginas para tratar descrições que quebram
 * na virada de página. Colunas são separadas pelos pontos médios entre âncoras.
 */
export function parseCatalogFromPositionedItems(
  pages: Array<Array<PDFTextItem>>,
): CatalogProduct[] {
  const products: CatalogProduct[] = [];
  let anchors: ColumnAnchors | null = null;
  let pending: CatalogProduct | null = null;

  const flush = () => {
    if (!pending) return;
    pending.nome = pending.nome.replace(/\s+/g, " ").trim();
    const cat = (pending.categoria ?? "").replace(/\s+/g, " ").trim();
    pending.categoria = cat || null;
    if (pending.codigo && pending.nome) products.push(pending);
    pending = null;
  };

  for (const pageItems of pages) {
    const rows = groupRows(pageItems);
    if (!anchors) anchors = findAnchors(rows);
    if (!anchors) continue;

    const codigoEnd = (anchors.codigoX + anchors.descricaoX) / 2;
    const descricaoEnd = (anchors.descricaoX + anchors.umX) / 2;
    // Faixa da coluna "Grupo de produto" (entre Tipo e Família).
    const grupoStart = anchors.grupoX != null ? (anchors.tipoX + anchors.grupoX) / 2 : null;
    const grupoEnd =
      anchors.grupoX != null
        ? anchors.familiaX != null
          ? (anchors.grupoX + anchors.familiaX) / 2
          : anchors.grupoX + 100
        : null;

    const grupoDe = (cells: Array<{ str: string; x: number }>): string => {
      if (grupoStart == null || grupoEnd == null) return "";
      return cells
        .filter((c) => c.x >= grupoStart && c.x < grupoEnd)
        .map((c) => c.str)
        .join(" ")
        .trim();
    };

    for (const cells of rows) {
      if (isHeaderRow(cells)) continue;

      const codigoCells = cells.filter((c) => c.x < codigoEnd);
      const descricaoCells = cells.filter((c) => c.x >= codigoEnd && c.x < descricaoEnd);
      const codigo = codigoCells.map((c) => c.str).join(" ").trim();
      const descricao = descricaoCells.map((c) => c.str).join(" ").trim();
      const grupo = grupoDe(cells);

      if (codigo) {
        // Nova linha de produto
        flush();

        const unidadeCells = cells
          .filter((c) => c.x >= descricaoEnd && c.x < anchors!.tipoX && isUnitLike(c.str))
          .sort((a, b) => a.x - b.x);
        const ressupText = cells.map((c) => c.str).join(" ");
        const tipo: CatalogTipo = decidirTipo(codigo, ressupText);

        pending = {
          codigo,
          nome: descricao,
          unidade: unidadeCells[0] ? normalizeUnit(unidadeCells[0].str) : null,
          unidadeSecundaria: unidadeCells[1] ? normalizeUnit(unidadeCells[1].str) : null,
          tipo,
          categoria: grupo || null,
        };
      } else if (pending) {
        // Continuação (multilinha / virada de página): acumula descrição e grupo.
        if (descricao) pending.nome = `${pending.nome} ${descricao}`;
        if (grupo) pending.categoria = pending.categoria ? `${pending.categoria} ${grupo}` : grupo;
      }
    }
  }

  flush();
  return products;
}

/** Junta produtos de vários PDFs e remove duplicados por código (mantém o último). */
export function dedupeCatalog(products: CatalogProduct[]): CatalogProduct[] {
  const byCodigo = new Map<string, CatalogProduct>();
  for (const p of products) byCodigo.set(p.codigo, p);
  return Array.from(byCodigo.values());
}

/** Lê um PDF de catálogo Nomus e devolve os produtos. */
export async function parseCatalogFile(file: File): Promise<CatalogProduct[]> {
  const buffer = await readFileAsArrayBuffer(file);
  const pages = await extractPositionedTextFromPDF(buffer);
  return parseCatalogFromPositionedItems(pages);
}
