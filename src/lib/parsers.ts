// ── Types ──────────────────────────────────────────────
export interface InvoiceItem {
  code: string;
  description: string;
  unitPrice: number;
  quantity: number;
  unit: string;
  source?: string; // invoice filename or number
  emissionDate?: string; // ISO date string from the invoice
  supplier?: string; // supplier/emitter name
}

/** Parse Brazilian number format: "1.234,56" → 1234.56 or "1,00" → 1.0 */
function parseBRNumber(str: string): number {
  if (!str) return 0;
  const cleaned = str.trim().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function isNumericToken(str: string): boolean {
  const normalized = str.trim();
  return !!normalized && /^[\d.,]+$/.test(normalized);
}

function normalizeInvoiceUnit(unit: string): string {
  const normalized = unit.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return "";
  if (isNumericToken(normalized)) return "";
  if (!/[A-ZÀ-Ý]/.test(normalized)) return "";
  if (!/^[A-ZÀ-Ý0-9/\-]+$/.test(normalized)) return "";
  if (normalized.length > 10) return "";
  return normalized;
}

// ── Invoice Parsing ────────────────────────────────────

/** Parse NF-e XML or HTML invoice */
export function parseInvoiceFromXML(content: string): InvoiceItem[] {
  const parser = new DOMParser();
  // Try XML first, fallback to HTML
  let doc = parser.parseFromString(content, "text/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    doc = parser.parseFromString(content, "text/html");
  }

  const items: InvoiceItem[] = [];

  // Extract emission date from NF-e XML
  let emissionDate: string | undefined;
  const dhEmi = doc.querySelector("dhEmi, ide dhEmi")?.textContent?.trim();
  if (dhEmi) {
    // dhEmi format: "2026-03-15T10:30:00-03:00" → extract date part
    emissionDate = dhEmi.substring(0, 10);
  } else {
    const dEmi = doc.querySelector("dEmi, ide dEmi")?.textContent?.trim();
    if (dEmi) emissionDate = dEmi;
  }

  // Helper to find elements ignoring namespace prefixes
  const findAll = (parent: Document | Element, localName: string): Element[] => {
    // Try without namespace first
    let els = parent.querySelectorAll(localName);
    if (els.length > 0) return Array.from(els);
    // Try with wildcard namespace (handles xmlns)
    els = parent.querySelectorAll(`*|${localName}`);
    if (els.length > 0) return Array.from(els);
    // Manual fallback: getElementsByTagName works with local names across namespaces
    return Array.from(parent.getElementsByTagName(localName));
  };
  const findOne = (parent: Document | Element, localName: string): Element | null => {
    const result = findAll(parent, localName);
    return result.length > 0 ? result[0] : null;
  };

  // Also try to get emission date with namespace-aware lookup
  if (!emissionDate) {
    const dhEmi2 = findOne(doc, "dhEmi");
    if (dhEmi2?.textContent) {
      emissionDate = dhEmi2.textContent.trim().substring(0, 10);
    } else {
      const dEmi2 = findOne(doc, "dEmi");
      if (dEmi2?.textContent) emissionDate = dEmi2.textContent.trim();
    }
  }

  // Extract supplier name from <emit><xNome>
  let supplier: string | undefined;
  const emitEl = findOne(doc, "emit");
  if (emitEl) {
    const xNome = findOne(emitEl, "xNome");
    if (xNome?.textContent) supplier = xNome.textContent.trim();
  }

  // NF-e format: <det><prod><cProd>CODE</cProd><xProd>DESC</xProd><qCom>QTY</qCom><vUnCom>PRICE</vUnCom></prod></det>
  const detElements = findAll(doc, "det");

  if (detElements.length > 0) {
    for (const det of detElements) {
      const prod = findOne(det, "prod");
      if (!prod) continue;

      const code = findOne(prod, "cProd")?.textContent?.trim() || "";
      const desc = findOne(prod, "xProd")?.textContent?.trim() || "";
      const qtyText = findOne(prod, "qCom")?.textContent || "1";
      const priceText = findOne(prod, "vUnCom")?.textContent || "0";

      const qty = parseFloat(qtyText) || 1;
      const price = parseFloat(priceText) || 0;
      const unit = findOne(prod, "uCom")?.textContent?.trim() || "";

      if (desc && price > 0) {
        items.push({ code: code.toUpperCase(), description: desc, unitPrice: price, quantity: qty, unit, emissionDate, supplier });
      }
    }
    return items;
  }

  const pdf24Parsed = parseInvoiceFromPdf24Html(doc, emissionDate);
  if (pdf24Parsed.length > 0) return pdf24Parsed;

  // Fallback 1: Try parsing HTML tables (common NF-e HTML format)
  const rows = doc.querySelectorAll("table tr, tr");
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 3) continue;

    const texts = Array.from(cells).map((c) => c.textContent?.trim() || "");
    let code = "";
    let desc = "";
    let price = 0;
    let qty = 1;

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (!code && /^[A-Z0-9][A-Z0-9._\-/]+$/i.test(t)) {
        code = t;
      } else if (code && !desc && t.length > 3 && !/^[\d.,]+$/.test(t)) {
        desc = t;
      } else if (desc && /^[\d.,]+$/.test(t.replace(/R\$\s*/g, ""))) {
        const num = parseBRNumber(t.replace(/R\$\s*/g, ""));
        if (num > 0 && price === 0) {
          if (num < 1000 && num === Math.floor(num) && qty === 1) qty = num;
          else price = num;
        } else if (num > 0) {
          price = num;
        }
      }
    }

    if (desc && price > 0) {
      items.push({ code: code.toUpperCase(), description: desc, unitPrice: price, quantity: qty, unit: "", emissionDate });
    }
  }

  if (items.length > 0) return items;

  // Fallback 2: PDF24 HTML (texto em divs absolutas com top/left)
  const positionedDivs = Array.from(doc.querySelectorAll("div.pdf24_01[style*='top:']"));
  if (positionedDivs.length > 0) {
    const rowMap = new Map<number, Array<{ left: number; text: string }>>();

    for (const el of positionedDivs) {
      const style = el.getAttribute("style") || "";
      const topMatch = style.match(/top:\s*([\d.]+)em/i);
      if (!topMatch) continue;

      const leftMatch = style.match(/left:\s*([\d.]+)em/i);
      const top = parseFloat(topMatch[1]);
      const left = leftMatch ? parseFloat(leftMatch[1]) : 0;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;

      const rowKey = Math.round(top * 4) / 4;
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, []);
      rowMap.get(rowKey)!.push({ left, text });
    }

    const reconstructedText = Array.from(rowMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, cols]) => cols.sort((a, b) => a.left - b.left).map((c) => c.text).join(" "))
      .join("\n");

    const parsed = parseInvoiceFromText(reconstructedText);
    if (parsed.length > 0) {
      return parsed.map((item) => ({
        ...item,
        emissionDate: item.emissionDate || emissionDate,
      }));
    }
  }

  return items;
}

/** Extract emission date from text (DANFE format: "DATA DA EMISSÃO" or dd/mm/yyyy pattern near emission context) */
function extractEmissionDateFromText(text: string): string | undefined {
  const emissionMatch = text.match(/DATA\s+D[AE]\s+EMISS[ÃA]O[:\s]*(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4})/i);
  if (emissionMatch) {
    const [d, m, y] = emissionMatch[1].split(/[\/\.\-]/);
    return `${y}-${m}-${d}`;
  }

  const emMatch2 = text.match(/EMISS[ÃA]O[:\s]*(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4})/i);
  if (emMatch2) {
    const [d, m, y] = emMatch2[1].split(/[\/\.\-]/);
    return `${y}-${m}-${d}`;
  }
  return undefined;
}

/** Extract supplier name from DANFE text */
function extractSupplierFromText(text: string): string | undefined {
  // Pattern 1: "RECEBEMOS DE <NAME> OS PRODUTOS" — most reliable for DANFE emitter
  const recebemosMatch = text.match(/RECEBEMOS\s+DE\s+(.+?)\s+OS\s+PRODUTOS/i);
  if (recebemosMatch) {
    const name = recebemosMatch[1].trim();
    if (name.length > 3) return name;
  }
  // Pattern 2: Bold heading name right before "DANFE" (pdf.js extracts headings)
  const beforeDanfeMatch = text.match(/\n([A-ZÀ-ÿ][A-ZÀ-ÿ0-9 &.,/\-]{5,}(?:LTDA|S\.?A\.?|ME|EPP|EIRELI|S\/S|INDUSTRIAIS?))\s*\n.*DANFE/i);
  if (beforeDanfeMatch) {
    const name = beforeDanfeMatch[1].trim();
    if (name.length > 3) return name;
  }
  // Pattern 3: "RAZÃO SOCIAL" followed by the name (but skip DESTINATÁRIO/TRANSPORTADOR context)
  const razaoMatch = text.match(/RAZ[ÃA]O\s+SOCIAL[:\s]*([A-ZÀ-ÿ0-9][A-ZÀ-ÿ0-9 &.,/\-]+)/i);
  if (razaoMatch) return razaoMatch[1].trim();
  // Pattern 4: Name before first "CNPJ"
  const beforeCnpjMatch = text.match(/([A-ZÀ-ÿ][A-ZÀ-ÿa-zà-ÿ0-9 &.,/\-]{3,}?)\s*CNPJ/i);
  if (beforeCnpjMatch) {
    const name = beforeCnpjMatch[1].trim();
    if (name.length > 3 && !/^(EMITENTE|DESTINAT|REMETENTE|IDENTIFICA)/i.test(name)) {
      return name;
    }
  }
  return undefined;
}

function normalizeInvoiceDescription(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function appendInvoiceDescription(base: string, addition: string): string {
  const normalizedBase = normalizeInvoiceDescription(base);
  const normalizedAddition = normalizeInvoiceDescription(addition);

  if (!normalizedBase) return normalizedAddition;
  if (!normalizedAddition) return normalizedBase;

  if (/[A-ZÀ-ÿ]$/i.test(normalizedBase) && /^[A-ZÀ-ÿ]{1,3}:/.test(normalizedAddition)) {
    return `${normalizedBase}${normalizedAddition}`;
  }

  return `${normalizedBase} ${normalizedAddition}`;
}

function isInvoiceDescriptionContinuation(line: string): boolean {
  const trimmed = normalizeInvoiceDescription(line);
  if (!trimmed) return false;
  if (/^\|/.test(trimmed)) return false;
  // Stop words: section headers, tax fields, complementary info, bank data, transport, etc.
  if (/^(DADOS|INFORMA[ÇC]|RESERVADO|VALOR|BASE|AL[ÍI]Q|ICMS|IPI|CFOP|NCM|C[ÓO]DIGO|DESCRI|LOCAL DE ENTREGA|EMP:|FIL:|CONTROLE:|IMPRESSO)/i.test(trimmed)) {
    return false;
  }
  if (/CONTINUA[ÇC][ÃA]O\s+D/i.test(trimmed)) return false;
  if (/RECEBEMOS\s+DE/i.test(trimmed)) return false;
  if (/DADOS\s+BANC[ÁA]RIOS/i.test(trimmed)) return false;
  if (/BANCO\s+\w/i.test(trimmed)) return false;
  if (/N\.?\s*DOC\.?\s*TRANSPORTE/i.test(trimmed)) return false;
  if (/REPRESENTAN/i.test(trimmed)) return false;
  if (/ORDEM\s+DE\s+VENDA/i.test(trimmed)) return false;
  if (/EMISS[ÃA]O/i.test(trimmed)) return false;
  if (/DANFE/i.test(trimmed)) return false;
  if (/NOTA\s+FISCAL/i.test(trimmed)) return false;
  if (/CHAVE\s+DE\s+ACESSO/i.test(trimmed)) return false;
  if (/PROTOCOLO/i.test(trimmed)) return false;
  if (/NATUREZA\s+D/i.test(trimmed)) return false;
  if (/INSCRI[ÇC][ÃA]O\s+ESTADUAL/i.test(trimmed)) return false;
  if (/CNPJ/i.test(trimmed)) return false;
  if (/CEP:/i.test(trimmed)) return false;
  if (/TELEFONE:/i.test(trimmed)) return false;
  if (/S\.\s*ATEND/i.test(trimmed)) return false;
  if (/EMERGENCIA/i.test(trimmed)) return false;
  if (/CERTIFICADO\s+DE\s+QUALIDADE/i.test(trimmed)) return false;
  if (/MERCADORIA\s+DESTINADA/i.test(trimmed)) return false;
  if (/TRIB\.?\s*INTEGRAL/i.test(trimmed)) return false;
  if (/PRODUTO.*PERIGOSO/i.test(trimmed)) return false;
  if (/WWW\./i.test(trimmed)) return false;
  if (/IDENTIFICA[ÇC][ÃA]O/i.test(trimmed)) return false;
  if (/ASSINATURA/i.test(trimmed)) return false;
  if (/FOLHA.*\d+.*de.*\d+/i.test(trimmed)) return false;
  if (/^(\d+[.,]?\d*\s+){3,}/.test(trimmed)) return false;
  // Max reasonable description continuation length
  if (trimmed.length > 200) return false;
  return /[A-ZÀ-ÿ]/i.test(trimmed);
}

function parseInvoiceFromPdf24Html(doc: Document, emissionDate?: string): InvoiceItem[] {
  const positionedDivs = Array.from(doc.querySelectorAll("div.pdf24_01[style*='top:']"));
  if (positionedDivs.length === 0) return [];

  const rowMap = new Map<number, Array<{ left: number; text: string }>>();

  for (const el of positionedDivs) {
    const style = el.getAttribute("style") || "";
    const topMatch = style.match(/top:\s*([\d.]+)em/i);
    if (!topMatch) continue;

    const leftMatch = style.match(/left:\s*([\d.]+)em/i);
    const top = parseFloat(topMatch[1]);
    const left = leftMatch ? parseFloat(leftMatch[1]) : 0;
    const text = normalizeInvoiceDescription(el.textContent || "");
    if (!text) continue;

    const rowKey = Math.round(top * 8) / 8;
    if (!rowMap.has(rowKey)) rowMap.set(rowKey, []);
    rowMap.get(rowKey)!.push({ left, text });
  }

  const rows = Array.from(rowMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, cols]) =>
      cols
        .sort((a, b) => a.left - b.left)
        .map((col) => col.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    );

  const items: InvoiceItem[] = [];
  let inProductSection = false;
  let pendingItem: InvoiceItem | null = null;

  const flushPendingItem = () => {
    if (!pendingItem) return;
    items.push({
      ...pendingItem,
      description: normalizeInvoiceDescription(pendingItem.description),
    });
    pendingItem = null;
  };

  for (const line of rows) {
    if (!line) continue;
    const upperLine = line.toUpperCase();

    if (upperLine.includes("DADOS DO PRODUTO") || upperLine.includes("DADOS DOS PRODUTOS")) {
      flushPendingItem();
      inProductSection = true;
      continue;
    }

    if (!inProductSection) continue;

    if (upperLine.includes("DADOS ADICIONAIS") || upperLine.includes("INFORMAÇÕES COMPLEMENTARES") || upperLine.includes("RESERVADO AO FISCO")) {
      flushPendingItem();
      break;
    }

    if (/^(COD\.?|PROD\.?|DESCRI[ÇC][ÃA]O|VALOR|ALIQUOTAS|B\.?\s*CALC\.?|NCM|O\/CST|CFOP|UNID\.?|QUANT\.?|ICMS|IPI|TRIB)/i.test(line)) {
      continue;
    }

    const danfeMatch = line.match(/^\s*(\d{3,})\s+(.+?)\s+(\d{8})\s+(?:\d+\s+){1,3}(\d{4})\s+([A-Z]{1,4})\s+([\d.,]+)\s+([\d.,]+)/i);
    if (danfeMatch) {
      const [, code, desc, , , unit, qtyStr, priceStr] = danfeMatch;
      const qty = parseBRNumber(qtyStr) || 1;
      const price = parseBRNumber(priceStr);

      if (price > 0) {
        flushPendingItem();
        pendingItem = {
          code: code.toUpperCase(),
          description: desc.trim(),
          unitPrice: price,
          quantity: qty,
          unit: unit.toUpperCase(),
          emissionDate,
        };
        continue;
      }
    }

    if (pendingItem && isInvoiceDescriptionContinuation(line)) {
      pendingItem.description = appendInvoiceDescription(pendingItem.description, line);
    }
  }

  flushPendingItem();
  return items;
}

/** Parse invoice from PDF text (plain text fallback) */
export function parseInvoiceFromText(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const lines = text.split("\n");
  const emissionDate = extractEmissionDateFromText(text);
  const supplier = extractSupplierFromText(text);
  let pendingItem: InvoiceItem | null = null;

  const flushPendingItem = () => {
    if (!pendingItem) return;
    items.push({
      ...pendingItem,
      description: normalizeInvoiceDescription(pendingItem.description),
    });
    pendingItem = null;
  };

  for (const line of lines) {
    const normalizedLine = normalizeInvoiceDescription(line);
    if (!normalizedLine) continue;

    const match = line.match(/^\s*([A-Z0-9][A-Z0-9._/\-"']*)\s{2,}(.+?)\s{2,}([\d.,]+)\s+\w+\s+([\d.,]+)/i);
    if (match) {
      const [, code, desc, qtyStr, priceStr] = match;
      const qty = parseBRNumber(qtyStr) || 1;
      const price = parseBRNumber(priceStr);
      if (price > 0) {
        flushPendingItem();
        pendingItem = { code: code.toUpperCase(), description: desc.trim(), unitPrice: price, quantity: qty, unit: "", emissionDate, supplier };
      }
      continue;
    }

    // Aceita CST em 1-3 colunas (ex: "0 00"), comum em DANFE convertido para texto/HTML
    const danfeMatch = line.match(/^\s*(\d{3,})\s+(.+?)\s+(\d{8})\s+(?:\d+\s+){1,3}(\d{4})\s+([A-Z]{1,4})\s+([\d.,]+)\s+([\d.,]+)/i);
    if (danfeMatch) {
      const [, code, desc, , , unit, qtyStr, priceStr] = danfeMatch;
      const qty = parseBRNumber(qtyStr) || 1;
      const price = parseBRNumber(priceStr);
      if (price > 0) {
        flushPendingItem();
        pendingItem = { code: code.toUpperCase(), description: desc.trim(), unitPrice: price, quantity: qty, unit: unit.toUpperCase(), emissionDate, supplier };
      }
      continue;
    }

    if (pendingItem && isInvoiceDescriptionContinuation(normalizedLine)) {
      pendingItem.description = appendInvoiceDescription(pendingItem.description, normalizedLine);
      continue;
    }
  }

  flushPendingItem();

  return items;
}

/** Parse invoice (DANFE) from positioned PDF text items */
export function parseInvoiceFromPositionedItems(
  pages: Array<Array<PDFTextItem>>
): InvoiceItem[] {
  const items: InvoiceItem[] = [];

  // Extract emission date and supplier from all text on all pages
  const allText = pages.flatMap(p => p.map(i => i.str)).join(" ");
  const emissionDate = extractEmissionDateFromText(allText);
  const supplier = extractSupplierFromText(allText);
  let pendingItem: InvoiceItem | null = null;

  const flushPendingItem = () => {
    if (!pendingItem) return;
    items.push({
      ...pendingItem,
      description: normalizeInvoiceDescription(pendingItem.description),
    });
    pendingItem = null;
  };

  for (const pageItems of pages) {
    // Group items by approximate Y position (same row)
    const rowMap = new Map<number, Array<{ str: string; x: number }>>();
    for (const item of pageItems) {
      if (!item.str.trim()) continue;
      const roundedY = Math.round(item.y / 3) * 3;
      if (!rowMap.has(roundedY)) rowMap.set(roundedY, []);
      rowMap.get(roundedY)!.push({ str: item.str.trim(), x: item.x });
    }

    // Sort rows by Y position
    const sortedRows = Array.from(rowMap.entries()).sort((a, b) => a[0] - b[0]);

    // Find the product data section by looking for "DADOS DO PRODUTO" marker
    // then detect header columns within a range of Y positions
    let inProductSection = false;
    let headerDetected = false;
    let colBoundaries: { code: number; desc: number; ncm: number; unit: number; qty: number; price: number; total: number } | null = null;
    let headerSearchY = -1;

    for (const [y, cells] of sortedRows) {
      cells.sort((a, b) => a.x - b.x);
      const rowText = cells.map(c => c.str).join(" ").toUpperCase();

      // Detect "DADOS DO PRODUTO/SERVIÇO" marker
      if (rowText.includes("DADOS DO PRODUTO") || rowText.includes("DADOS DOS PRODUTOS")) {
        flushPendingItem();
        headerSearchY = y;
        colBoundaries = { code: 0, desc: 0, ncm: 0, unit: 0, qty: 0, price: 0, total: 0 };
        continue;
      }

      // If we found the section marker, scan nearby rows for header keywords
      if (headerSearchY > 0 && !headerDetected && y - headerSearchY < 80) {
        for (const cell of cells) {
          const t = cell.str.toUpperCase();
          if (colBoundaries) {
            if (t.includes("COD")) colBoundaries.code = cell.x;
            else if (t.includes("DESCRI") || t.includes("PRODUTO/SERVI")) colBoundaries.desc = cell.x;
            else if (t.includes("NCM")) colBoundaries.ncm = cell.x;
            else if (t.includes("UNID")) colBoundaries.unit = cell.x;
            else if (t.includes("QUANT")) colBoundaries.qty = cell.x;
            else if (t.includes("UNIT") && (t.includes("VALOR") || t.includes("V."))) colBoundaries.price = cell.x;
            else if ((t.includes("TOTAL") || t.startsWith("TOT") || (t.includes("VALOR") && t.includes("TOT")))) colBoundaries.total = cell.x;
            else if ((t === "VALOR" || t.startsWith("VALOR")) && !t.includes("TOTAL") && !colBoundaries.price) colBoundaries.price = cell.x;
          }
        }
        // Check if we have enough columns detected
        if (colBoundaries && colBoundaries.qty > 0 && (colBoundaries.price > 0 || colBoundaries.total > 0)) {
          headerDetected = true;
          inProductSection = true;
        }
        continue;
      }

      // Also detect header row directly (for PDFs without "DADOS DO PRODUTO" marker)
      if (!headerDetected && rowText.includes("COD") && (rowText.includes("DESCRI") || rowText.includes("PRODUTO")) && (rowText.includes("QUANT") || rowText.includes("VALOR"))) {
        inProductSection = true;
        headerDetected = true;
        colBoundaries = { code: 0, desc: 0, ncm: 0, unit: 0, qty: 0, price: 0, total: 0 };
        for (const cell of cells) {
          const t = cell.str.toUpperCase();
          if (t.includes("COD")) colBoundaries.code = cell.x;
          else if (t.includes("DESCRI") || t.includes("PRODUTO")) colBoundaries.desc = cell.x;
          else if (t.includes("NCM")) colBoundaries.ncm = cell.x;
          else if (t.includes("UNID")) colBoundaries.unit = cell.x;
          else if (t.includes("QUANT")) colBoundaries.qty = cell.x;
          else if (t.includes("UNIT") && (t.includes("VALOR") || t.includes("V."))) colBoundaries.price = cell.x;
          else if ((t.includes("TOTAL") || t.startsWith("TOT") || (t.includes("VALOR") && t.includes("TOT")))) colBoundaries.total = cell.x;
          else if ((t === "VALOR" || t.startsWith("VALOR")) && !t.includes("TOTAL") && !colBoundaries.price) colBoundaries.price = cell.x;
        }
        continue;
      }

      // Detect end of product section
      if (inProductSection && (rowText.includes("DADOS ADICION") || rowText.includes("INFORMAÇ") || rowText.includes("RESERVADO AO FISCO") || rowText.includes("CONTINUA") || rowText.includes("RECEBEMOS DE"))) {
        flushPendingItem();
        inProductSection = false;
        continue;
      }

      if (!inProductSection || !colBoundaries) continue;

      // Skip header continuation rows (e.g. "PROD.", "SERVIÇO", etc.)
      if (rowText.match(/^(PROD|SERVI|TRIB|B\.?\s*CALC|ALIQ|ICMS|IPI|SUBST)/)) continue;

      // Parse product row
      let code = "";
      let desc = "";
      let unit = "";
      let qtyStr = "";
      let priceStr = "";
      let totalStr = "";
      const unitCandidates: string[] = [];

      for (const cell of cells) {
        const x = cell.x;
        const rawText = cell.str.trim();

        if (colBoundaries.code >= 0 && x < (colBoundaries.desc || 999) - 10) {
          code = code ? code + " " + rawText : rawText;
        } else if (colBoundaries.desc && x >= colBoundaries.desc - 10 && x < (colBoundaries.ncm || colBoundaries.unit || 999) - 10) {
          desc = desc ? desc + " " + rawText : rawText;
        } else {
          const normalizedUnit = normalizeInvoiceUnit(rawText);
          const numeric = isNumericToken(rawText);
          const candidates: Array<{ column: "unit" | "qty" | "price" | "total"; distance: number }> = [];

          if (normalizedUnit && colBoundaries.unit > 0) {
            candidates.push({ column: "unit", distance: Math.abs(x - colBoundaries.unit) });
          }

          if (numeric) {
            if (colBoundaries.qty > 0) {
              candidates.push({ column: "qty", distance: Math.abs(x - colBoundaries.qty) });
            }
            if (colBoundaries.price > 0) {
              candidates.push({ column: "price", distance: Math.abs(x - colBoundaries.price) });
            }
            if (colBoundaries.total > 0) {
              candidates.push({ column: "total", distance: Math.abs(x - colBoundaries.total) });
            }
          }

          if (candidates.length === 0) continue;

          candidates.sort((a, b) => a.distance - b.distance);
          const best = candidates[0];

          if (best.column === "unit") {
            unitCandidates.push(normalizedUnit);
          } else if (best.column === "qty" && !qtyStr) {
            qtyStr = rawText;
          } else if (best.column === "price" && !priceStr) {
            priceStr = rawText;
          } else if (best.column === "total" && !totalStr) {
            totalStr = rawText;
          }
        }
      }

      unit = unitCandidates[0] || "";

      // Clean code - preserve numeric codes
      code = code.trim();
      const description = normalizeInvoiceDescription(desc);
      const hasValidCode = code.length > 0 && !/^(TRIB|B\.?\s*CALC|ALIQ|VALOR|BASE|ICMS|IPI|CFOP|NCM|CST)/i.test(code);

      const qty = parseBRNumber(qtyStr);
      let price = parseBRNumber(priceStr);
      const total = parseBRNumber(totalStr);

      // Validate price vs total consistency
      if (total > 0 && qty > 0) {
        const expectedTotalFromPrice = price * qty;
        if (price > 0 && Math.abs(expectedTotalFromPrice - total) / total < 0.02) {
          // price × qty ≈ total → price is correct unit price
        } else {
          // price is likely the total value (wrong column), or only total captured
          // Always trust total / qty as unit price
          price = total / qty;
        }
      } else if (price > 0 && qty > 1 && total <= 0) {
        // No total captured - check if price looks like a total
        // Heuristic: if price has exactly 2 decimal places and is much larger than
        // other numeric candidates, it might be the total
        // We can't be 100% sure without total, so leave as-is
      }

      if (hasValidCode && qty > 0 && price > 0) {
        flushPendingItem();
        pendingItem = {
          code: code.toUpperCase(),
          description,
          unitPrice: price,
          quantity: qty,
          unit: normalizeInvoiceUnit(unit),
          emissionDate,
          supplier,
        };
        continue;
      }

      if (pendingItem && description && qty <= 0 && price <= 0 && total <= 0 && !hasValidCode) {
        pendingItem.description = appendInvoiceDescription(pendingItem.description, description);
      }
    }
  }

  flushPendingItem();

  return items;
}

// ── PDF Text Extraction ────────────────────────────────

export interface PDFTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

let _pdfjsLib: any = null;

async function initPdfJs() {
  if (_pdfjsLib) return _pdfjsLib;
  const pdfjsLib = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
  _pdfjsLib = pdfjsLib;
  return pdfjsLib;
}

/** Pre-initialize pdf.js (call before batch processing) */
export async function ensurePdfJsReady(): Promise<void> {
  await initPdfJs();
}

function clonePdfData(data: ArrayBuffer): Uint8Array {
  // pdf.js can detach buffers internally; clone to keep source reusable
  return new Uint8Array(data.slice(0));
}

/** Extract positioned text items from PDF (for table parsing) */
export async function extractPositionedTextFromPDF(
  data: ArrayBuffer
): Promise<Array<Array<PDFTextItem>>> {
  const pdfjsLib = await initPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: clonePdfData(data) }).promise;
  const pages: Array<Array<PDFTextItem>> = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageItems: PDFTextItem[] = [];

    for (const item of content.items) {
      if ("str" in item && item.str.trim()) {
        // pdf.js transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const tx = (item as any).transform;
        if (tx) {
          pageItems.push({
            str: item.str,
            x: tx[4],
            y: viewport.height - tx[5], // flip Y to top-down
            width: (item as any).width || 0,
          });
        }
      }
    }
    pages.push(pageItems);
  }

  return pages;
}

export async function extractTextFromPDF(data: ArrayBuffer): Promise<string> {
  const pdfjsLib = await initPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: clonePdfData(data) }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    const rowMap = new Map<number, Array<{ str: string; x: number }>>();
    for (const item of content.items) {
      if ("str" in item && item.str.trim()) {
        const tx = (item as any).transform;
        if (!tx) continue;
        const y = Math.round((viewport.height - tx[5]) / 3) * 3;
        if (!rowMap.has(y)) rowMap.set(y, []);
        rowMap.get(y)!.push({ str: item.str.trim(), x: tx[4] });
      }
    }

    const lines = Array.from(rowMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map((c) => c.str).join(" "))
      .filter(Boolean);

    fullText += lines.join("\n") + "\n";
  }

  return fullText;
}

// ── File Reading Helper ────────────────────────────────

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
