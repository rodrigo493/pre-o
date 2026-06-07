import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ImportDropzone from "@/components/ImportDropzone";
import ImportPreviewTable from "@/components/ImportPreviewTable";
import {
  parseInvoiceFromXML,
  parseInvoiceFromPositionedItems,
  parseInvoiceFromText,
  extractPositionedTextFromPDF,
  extractTextFromPDF,
  readFileAsText,
  readFileAsArrayBuffer,
  type InvoiceItem,
} from "@/lib/parsers";
import {
  buildPreviewNota,
  todayISO,
  type PreviewNota,
  type PreviewRow,
} from "@/lib/importPreview";
import { aplicarAutoVinculo } from "@/lib/autoLink";
import { createNota } from "@/repositories/notasRepo";
import { insertItens } from "@/repositories/itensNotaRepo";
import { listVinculos } from "@/repositories/vinculosRepo";

async function parseFile(file: File): Promise<PreviewNota> {
  const hoje = todayISO();
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".xml")) {
    const text = await readFileAsText(file);
    const items = parseInvoiceFromXML(text);
    return buildPreviewNota(items, "xml", file.name, hoje);
  }

  // PDF: positioned parse first, fallback to plain-text parse.
  const buffer = await readFileAsArrayBuffer(file);
  let items: InvoiceItem[] = [];
  try {
    const pages = await extractPositionedTextFromPDF(buffer);
    items = parseInvoiceFromPositionedItems(pages);
  } catch {
    items = [];
  }
  if (items.length === 0) {
    const text = await extractTextFromPDF(buffer);
    items = parseInvoiceFromText(text);
  }
  return buildPreviewNota(items, "pdf", file.name, hoje);
}

export default function Importar() {
  const queryClient = useQueryClient();
  const [notas, setNotas] = useState<PreviewNota[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFiles = async (files: File[]) => {
    setParsing(true);
    const novas: PreviewNota[] = [];
    for (const file of files) {
      try {
        const nota = await parseFile(file);
        if (nota.rows.length === 0) {
          toast.warning(`${file.name}: nenhum item reconhecido.`);
          continue;
        }
        novas.push(nota);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        toast.error(`Falha ao ler ${file.name}: ${msg}`);
      }
    }
    if (novas.length > 0) setNotas((prev) => [...prev, ...novas]);
    setParsing(false);
  };

  const handleRowChange = (
    notaId: string,
    rowId: string,
    patch: Partial<PreviewRow>,
  ) => {
    setNotas((prev) =>
      prev.map((nota) =>
        nota.id !== notaId
          ? nota
          : {
              ...nota,
              rows: nota.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
            },
      ),
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    let totalSalvos = 0;
    let totalAuto = 0;
    let totalPendentes = 0;
    let falhas = 0;

    try {
      const vinculos = await listVinculos();

      for (const nota of notas) {
        const validRows = nota.rows.filter((r) => r.custo_unitario > 0);
        if (validRows.length === 0) continue;

        try {
          const notaRow = await createNota({
            numero: nota.numero ?? null,
            fornecedor: nota.fornecedor || null,
            data_emissao: nota.data_emissao,
            origem: nota.origem,
            arquivo_nome: nota.arquivo_nome,
          });

          const { vinculados } = aplicarAutoVinculo(
            validRows.map((r) => ({ id: r.id, cprod: r.cprod })),
            vinculos,
          );
          const mestrePorRowId = new Map(vinculados.map((v) => [v.id, v.produtoMestreId]));

          await insertItens(
            validRows.map((r) => ({
              nota_id: notaRow.id,
              cprod: r.cprod,
              descricao: r.descricao,
              unidade: r.unidade || null,
              custo_unitario: r.custo_unitario,
              quantidade: r.quantidade,
              produto_mestre_id: mestrePorRowId.get(r.id) ?? null,
            })),
          );

          totalSalvos += validRows.length;
          totalAuto += vinculados.length;
          totalPendentes += validRows.length - vinculados.length;
        } catch (err) {
          falhas += 1;
          const msg = err instanceof Error ? err.message : "erro desconhecido";
          toast.error(`Falha ao salvar ${nota.arquivo_nome}: ${msg}`);
        }
      }

      if (totalSalvos > 0) {
        toast.success(
          `${totalSalvos} itens salvos, ${totalAuto} auto-vinculados, ${totalPendentes} para vincular.`,
        );
        queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
        queryClient.invalidateQueries({ queryKey: ["pendentes"] });
        queryClient.invalidateQueries({ queryKey: ["itens"] });
        // Remove notas que foram totalmente salvas; mantém as que falharam.
        if (falhas === 0) setNotas([]);
      } else if (falhas === 0) {
        toast.warning("Nenhum item com custo válido para salvar.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      toast.error(`Erro ao salvar: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const totalRows = notas.reduce((acc, n) => acc + n.rows.length, 0);
  const hasNotas = notas.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Importar notas fiscais</h1>
        <p className="text-sm text-muted-foreground">
          Solte arquivos XML (NF-e) ou PDF (DANFE). Revise os custos antes de salvar.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ImportDropzone onFiles={handleFiles} disabled={parsing || saving} />
          {parsing && (
            <p className="mt-3 text-sm text-muted-foreground">Lendo arquivos…</p>
          )}
        </CardContent>
      </Card>

      {hasNotas && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">
              Pré-visualização ({notas.length} nota(s), {totalRows} item(ns))
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setNotas([])} disabled={saving}>
                Limpar
              </Button>
              <Button onClick={handleSaveAll} disabled={saving}>
                {saving ? "Salvando…" : "Salvar tudo"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ImportPreviewTable notas={notas} onRowChange={handleRowChange} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
