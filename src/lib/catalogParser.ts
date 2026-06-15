import * as XLSX from "xlsx";
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

/**
 * Decide o tipo SÓ pelo prefixo do código (US/LA/TB/MO/MOF = peça/conjunto montado).
 * NÃO usa a coluna Ressuprimento (comprado/fabricado) — a pedido: separar pelo grupo.
 */
function decidirTipo(codigo: string): CatalogTipo {
  if (FABRICADO_PREFIXES.has(prefixoCodigo(codigo))) return "montado";
  return "comprado";
}

interface ColumnAnchors {
  codigoX: number;
  descricaoX: number;
  umX: number;
  tipoX: number;
  grupoX: number | null;
  familiaX: number | null;
  ressupX: number | null;
}

/**
 * Acha as âncoras das colunas. Funde a "banda" do cabeçalho (linha do "Código"
 * + as 2 linhas seguintes), porque no Nomus os títulos quebram em duas baselines
 * ("Código do" / "produto") e um jitter de 1px separaria as células — o que antes
 * fazia o PDF inteiro virar 0 produtos sem aviso.
 */
function findAnchors(rows: Array<Array<{ str: string; x: number }>>): ColumnAnchors | null {
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].some((c) => c.str.includes("Código"))) continue;

    const band = [...rows[i], ...(rows[i + 1] ?? []), ...(rows[i + 2] ?? [])];
    const codigo = band.find((c) => c.str.includes("Código"));
    const descricao = band.find((c) => /Descri/.test(c.str));
    // Primeiro "U.M." pela posição (a Secundária vem depois).
    const ums = band.filter((c) => /^U\.?M\.?/i.test(c.str.trim())).sort((a, b) => a.x - b.x);
    const tipo = band.find((c) => /^Tipo/.test(c.str.trim()));
    const grupo = band.find((c) => /^Grupo/.test(c.str.trim()));
    const familia = band.find((c) => /^Fam/.test(c.str.trim()));
    const ressup = band.find((c) => /^Ressup/.test(c.str.trim()));
    if (!codigo || !descricao || ums.length === 0 || !tipo) continue;

    return {
      codigoX: codigo.x,
      descricaoX: descricao.x,
      umX: ums[0].x,
      tipoX: tipo.x,
      grupoX: grupo ? grupo.x : null,
      familiaX: familia ? familia.x : null,
      ressupX: ressup ? ressup.x : null,
    };
  }
  return null;
}

/**
 * Agrupa itens em linhas visuais por proximidade de Y (tolerância), em vez de
 * arredondar para um bucket fixo. Bucket fixo separava células da mesma linha
 * quando o Y diferia por ~1px na fronteira do bucket.
 */
const Y_TOL = 4;
function groupRows(items: PDFTextItem[]): Array<Array<{ str: string; x: number }>> {
  const cells = items
    .filter((it) => it.str.trim())
    .map((it) => ({ str: it.str.trim(), x: it.x, y: it.y }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: Array<{ y: number; cells: Array<{ str: string; x: number }> }> = [];
  for (const c of cells) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(c.y - last.y) <= Y_TOL) {
      last.cells.push({ str: c.str, x: c.x });
    } else {
      rows.push({ y: c.y, cells: [{ str: c.str, x: c.x }] });
    }
  }
  return rows.map((r) => r.cells.sort((a, b) => a.x - b.x));
}

/** Remove palavras de outras colunas que possam ter vazado para o grupo. */
function limparCategoria(cat: string): string {
  return cat
    .replace(/\s+/g, " ")
    .replace(/\b(Comprado|Fabricado|Sim|N[ãa]o)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeaderRow(cells: Array<{ str: string; x: number }>): boolean {
  return cells.some((c) => c.str.includes("Código")) && cells.some((c) => /Descri/.test(c.str));
}

export interface CatalogDebug {
  anchors: ColumnAnchors | null;
  codigoEnd: number | null;
  descricaoEnd: number | null;
  linhas: string[]; // primeiras linhas da 1ª página: "x:str | x:str"
}

export interface CatalogParseResult {
  produtos: CatalogProduct[];
  paginas: number;
  porPagina: number[]; // produtos reconhecidos por página (aprox. na virada)
  anchorsAchados: boolean; // se o cabeçalho de colunas foi reconhecido
  debug: CatalogDebug;
}

/**
 * Parse o relatório "Produtos | Nomus" a partir dos itens posicionados do PDF,
 * com diagnóstico por página. Mantém o produto pendente entre páginas para
 * tratar descrições que quebram na virada. Colunas separadas pelos pontos
 * médios entre âncoras; a coluna Grupo é limitada por Família/Ressuprimento.
 */
export function parseCatalogWithDiag(pages: Array<Array<PDFTextItem>>): CatalogParseResult {
  const products: CatalogProduct[] = [];
  const porPagina: number[] = pages.map(() => 0);
  let anchors: ColumnAnchors | null = null;
  let pending: CatalogProduct | null = null;
  let pendingPagina = -1; // página onde o produto pendente começou
  const debug: CatalogDebug = { anchors: null, codigoEnd: null, descricaoEnd: null, linhas: [] };

  const flush = () => {
    if (!pending) return;
    pending.nome = pending.nome.replace(/\s+/g, " ").trim();
    pending.categoria = limparCategoria(pending.categoria ?? "") || null;
    // Conta no flush (atribui à página de origem) e só o que será mantido —
    // assim a 2ª baseline do cabeçalho ("produto") não infla a contagem.
    if (pending.codigo && pending.nome) {
      products.push(pending);
      if (pendingPagina >= 0) porPagina[pendingPagina] += 1;
    }
    pending = null;
  };

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageItems = pages[pageIdx];
    const rows = groupRows(pageItems);
    if (!anchors) anchors = findAnchors(rows);
    // Captura amostra da 1ª página para diagnóstico (independe de achar âncoras).
    if (pageIdx === 0) {
      debug.linhas = rows
        .slice(0, 14)
        .map((r) => r.map((c) => `${Math.round(c.x)}:${c.str}`).join(" | "));
    }
    if (!anchors) continue;

    const codigoEnd = (anchors.codigoX + anchors.descricaoX) / 2;
    const descricaoEnd = (anchors.descricaoX + anchors.umX) / 2;
    if (pageIdx === 0 || debug.anchors == null) {
      debug.anchors = anchors;
      debug.codigoEnd = codigoEnd;
      debug.descricaoEnd = descricaoEnd;
    }
    // Faixa da coluna "Grupo de produto": entre Tipo e a próxima coluna
    // (Família, se houver; senão Ressuprimento; senão margem fixa).
    const grupoStart = anchors.grupoX != null ? (anchors.tipoX + anchors.grupoX) / 2 : null;
    const grupoEnd =
      anchors.grupoX == null
        ? null
        : anchors.familiaX != null
          ? (anchors.grupoX + anchors.familiaX) / 2
          : anchors.ressupX != null
            ? (anchors.grupoX + anchors.ressupX) / 2
            : anchors.grupoX + 80;

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
        pendingPagina = pageIdx;

        const unidadeCells = cells
          .filter((c) => c.x >= descricaoEnd && c.x < anchors!.tipoX && isUnitLike(c.str))
          .sort((a, b) => a.x - b.x);
        const tipo: CatalogTipo = decidirTipo(codigo);

        pending = {
          codigo,
          nome: descricao,
          unidade: unidadeCells[0] ? normalizeUnit(unidadeCells[0].str) : null,
          unidadeSecundaria: unidadeCells[1] ? normalizeUnit(unidadeCells[1].str) : null,
          tipo,
          categoria: grupo || null,
        };
      } else if (pending) {
        // Continuação (multilinha / virada de página): acumula descrição e grupo
        // (nomes de grupo podem quebrar em 2 linhas no Nomus).
        if (descricao) pending.nome = `${pending.nome} ${descricao}`;
        if (grupo) pending.categoria = pending.categoria ? `${pending.categoria} ${grupo}` : grupo;
      }
    }
  }

  flush();

  return {
    produtos: products,
    paginas: pages.length,
    porPagina,
    anchorsAchados: anchors != null,
    debug,
  };
}

/** Compatibilidade: devolve só os produtos. */
export function parseCatalogFromPositionedItems(
  pages: Array<Array<PDFTextItem>>,
): CatalogProduct[] {
  return parseCatalogWithDiag(pages).produtos;
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

/** Lê um PDF de catálogo Nomus e devolve produtos + diagnóstico por página. */
export async function parseCatalogFileWithDiag(file: File): Promise<CatalogParseResult> {
  const buffer = await readFileAsArrayBuffer(file);
  const pages = await extractPositionedTextFromPDF(buffer);
  return parseCatalogWithDiag(pages);
}

// ── Importação por planilha (CSV / Excel) ──────────────────────────────
// Caminho mais confiável que o PDF: colunas vêm nomeadas, sem adivinhar X/Y.

function normKey(k: string): string {
  return stripAccents(k).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Mapeia uma matriz (linhas × colunas) do relatório Nomus → CatalogProduct.
 * Acha a LINHA DE CABEÇALHO dinamicamente (a 1ª que tem "Código" e "Descrição"),
 * ignorando título "Produtos | Nomus", filtros e linhas em branco no topo.
 */
export function parseCatalogFromSheetMatrix(matrix: unknown[][]): CatalogProduct[] {
  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const cells = (matrix[i] ?? []).map((c) => normKey(String(c ?? "")));
    if (cells.some((c) => c.includes("codigo")) && cells.some((c) => c.includes("descri"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const header = (matrix[headerIdx] ?? []).map((c) => normKey(String(c ?? "")));
  const iCodigo = header.findIndex((h) => h.includes("codigo"));
  const iDescricao = header.findIndex((h) => h.includes("descri"));
  const iUmSec = (() => {
    const a = header.findIndex((h) => h.includes("um") && h.includes("secund"));
    return a >= 0 ? a : header.findIndex((h) => h.includes("secund"));
  })();
  const iUm = (() => {
    const exato = header.findIndex((h) => h === "um");
    if (exato >= 0) return exato;
    return header.findIndex((h) => (h.includes("um") || h.includes("unidade")) && !h.includes("secund"));
  })();
  const iGrupo = header.findIndex((h) => h.includes("grupo"));
  if (iCodigo < 0 || iDescricao < 0) return [];

  const cell = (row: unknown[], i: number): string => (i >= 0 ? String(row?.[i] ?? "").trim() : "");

  const out: CatalogProduct[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const codigo = cell(row, iCodigo);
    const nome = cell(row, iDescricao).replace(/\s+/g, " ").trim();
    if (!codigo || !nome) continue;
    const um = cell(row, iUm);
    const umSec = cell(row, iUmSec);
    out.push({
      codigo,
      nome,
      unidade: um ? normalizeUnit(um) : null,
      unidadeSecundaria: umSec ? normalizeUnit(umSec) : null,
      tipo: decidirTipo(codigo),
      categoria: limparCategoria(cell(row, iGrupo)) || null,
    });
  }
  return out;
}

/** Versão por objetos (chaves = cabeçalho). Converte para matriz e delega. */
export function parseCatalogFromSheetRows(
  rows: Array<Record<string, unknown>>,
): CatalogProduct[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  const matrix: unknown[][] = [keys, ...rows.map((r) => keys.map((k) => r[k]))];
  return parseCatalogFromSheetMatrix(matrix);
}

/** Lê CSV/Excel do catálogo Nomus e devolve produtos + diagnóstico. */
export async function parseCatalogSheetFileWithDiag(file: File): Promise<CatalogParseResult> {
  const buffer = await readFileAsArrayBuffer(file);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    // Alguns ERPs exportam "Excel" que na verdade é HTML/SpreadsheetML — tenta como binário.
    wb = XLSX.read(buffer, { type: "binary" });
  }
  const nomesAbas = wb.SheetNames ?? [];
  // Usa a 1ª aba que tiver alguma linha.
  let matrix: unknown[][] = [];
  for (const nome of nomesAbas) {
    const sheet = wb.Sheets[nome];
    if (!sheet) continue;
    const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
    if (m.length > 0) {
      matrix = m;
      break;
    }
  }
  const produtos = parseCatalogFromSheetMatrix(matrix);
  const debug: CatalogDebug = {
    anchors: null,
    codigoEnd: null,
    descricaoEnd: null,
    linhas: [
      `abas: [${nomesAbas.join(", ")}] · linhas lidas: ${matrix.length}`,
      ...matrix.slice(0, 6).map((r) => (r ?? []).map((c) => String(c ?? "")).join(" | ")),
    ],
  };
  return {
    produtos,
    paginas: 1,
    porPagina: [produtos.length],
    anchorsAchados: produtos.length > 0,
    debug,
  };
}
