import * as XLSX from "xlsx";
import type { LinhaProduto } from "@/hooks/useProdutosResolvidos";

export function montarLinhasExport(linhas: LinhaProduto[]) {
  return linhas.map((l) => ({
    "Código": l.codigo ?? "",
    Produto: l.nome,
    Categoria: l.categoria ?? "",
    Tipo: l.tipo,
    "Maior custo": l.resolvido.custoBase ?? "",
    "Preço venda": l.resolvido.precoVenda ?? "",
    "Margem %": l.resolvido.margemPercent != null ? Number(l.resolvido.margemPercent.toFixed(1)) : "",
    "Data do custo": l.resolvido.origem?.dataEmissao ?? "",
    "Nº notas no período": l.resolvido.numNotasPeriodo,
    Status: l.resolvido.status,
  }));
}

export function exportarXlsx(linhas: LinhaProduto[], nomeArquivo = "tabela-precos.xlsx") {
  const ws = XLSX.utils.json_to_sheet(montarLinhasExport(linhas));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Preços");
  XLSX.writeFile(wb, nomeArquivo);
}
