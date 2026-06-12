import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PreviewNota, PreviewRow } from "@/lib/importPreview";

interface ImportPreviewTableProps {
  notas: PreviewNota[];
  onRowChange: (notaId: string, rowId: string, patch: Partial<PreviewRow>) => void;
}

export default function ImportPreviewTable({ notas, onRowChange }: ImportPreviewTableProps) {
  return (
    <div className="flex flex-col gap-6">
      {notas.map((nota) => {
        const validos = nota.rows.filter((r) => r.custo_unitario > 0).length;
        const descartados = nota.rows.length - validos;
        return (
          <div key={nota.id} className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{nota.arquivo_nome}</p>
                <p className="text-xs text-muted-foreground">
                  {nota.fornecedor || "Fornecedor não identificado"} · origem {nota.origem.toUpperCase()}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {validos} válido(s)
                {descartados > 0 && ` · ${descartados} sem custo (descartado)`}
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-20">Un.</TableHead>
                  <TableHead className="w-24">Qtde</TableHead>
                  <TableHead className="w-32">Custo unit.</TableHead>
                  <TableHead className="w-40">Data emissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nota.rows.map((row) => {
                  const semCusto = row.custo_unitario <= 0;
                  return (
                    <TableRow key={row.id} className={cn(semCusto && "bg-destructive/5")}>
                      <TableCell className="font-mono text-xs">{row.cprod || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Input
                            value={row.descricao}
                            onChange={(e) =>
                              onRowChange(nota.id, row.id, { descricao: e.target.value })
                            }
                            className="h-8"
                          />
                          {semCusto && (
                            <span className="text-xs font-medium text-destructive">
                              sem custo — será descartado
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{row.unidade || "—"}</TableCell>
                      <TableCell className="text-sm">{row.quantidade}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={row.custo_unitario}
                          onChange={(e) =>
                            onRowChange(nota.id, row.id, {
                              custo_unitario: Number(e.target.value),
                            })
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={row.data_emissao}
                          onChange={(e) =>
                            onRowChange(nota.id, row.id, { data_emissao: e.target.value })
                          }
                          className="h-8"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
