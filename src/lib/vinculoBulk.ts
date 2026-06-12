export interface ParVinculo {
  cprod: string;
  codigo: string;
  produtoId: string;
}
export interface LinhaInvalida {
  linha: string;
  motivo: string;
}
export interface ResultadoParse {
  pares: ParVinculo[];
  invalidas: LinhaInvalida[];
}

function normalizeCod(s: string): string {
  return s.trim().toUpperCase();
}
function primeiroToken(s: string): string {
  return s.trim().split(/\s+/)[0] ?? "";
}

/**
 * Parseia uma lista colada (cProd → código do catálogo) em pares prontos para
 * vincular. Aceita células separadas por TAB, ";" ou "|" (e, no fallback, por 2+
 * espaços). Em cada linha acha a célula que é um código existente no catálogo
 * (`mapaCodigo`); a outra célula vira o cProd (primeiro token). Dedupe por cProd.
 */
export function parseVinculoLista(texto: string, mapaCodigo: Map<string, string>): ResultadoParse {
  const pares: ParVinculo[] = [];
  const invalidas: LinhaInvalida[] = [];
  const vistos = new Set<string>();

  for (const raw of texto.split(/\r?\n/)) {
    const linha = raw.trim();
    if (!linha) continue;

    let celulas = linha.split(/\t|;|\|/).map((c) => c.trim()).filter(Boolean);
    if (celulas.length < 2) celulas = linha.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);

    let codigo = "";
    let produtoId = "";
    let idxCodigo = -1;
    for (let i = 0; i < celulas.length; i++) {
      const k = normalizeCod(celulas[i]);
      const id = mapaCodigo.get(k) ?? mapaCodigo.get(k.replace(/\s+/g, ""));
      if (id) {
        codigo = celulas[i].trim();
        produtoId = id;
        idxCodigo = i;
        break;
      }
    }
    if (!produtoId) {
      invalidas.push({ linha, motivo: "código do catálogo não encontrado" });
      continue;
    }

    const cprodCell = celulas.find((_, i) => i !== idxCodigo) ?? "";
    const cprod = primeiroToken(cprodCell);
    if (!cprod) {
      invalidas.push({ linha, motivo: "cProd não identificado" });
      continue;
    }

    const chave = cprod.toUpperCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pares.push({ cprod, codigo, produtoId });
  }

  return { pares, invalidas };
}
