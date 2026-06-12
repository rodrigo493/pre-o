import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getNotaById } from "@/repositories/notasRepo";
import { listItensPorNota } from "@/repositories/itensNotaRepo";
import { formatCurrency } from "@/lib/pricing";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}
function dataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function NotaDetalhe() {
  const { id = "" } = useParams();

  const notaQuery = useQuery({ queryKey: ["nota", id], queryFn: () => getNotaById(id), enabled: !!id });
  const itensQuery = useQuery({
    queryKey: ["itens-nota", id],
    queryFn: () => listItensPorNota(id),
    enabled: !!id,
  });

  const nota = notaQuery.data;
  const itens = itensQuery.data ?? [];
  const total = itens.reduce(
    (s, i) => s + Number(i.custo_unitario) * Number(i.quantidade ?? 1),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/notas">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {nota ? `Nota ${nota.numero ? `nº ${nota.numero}` : ""}` : "Nota"}
        </h1>
      </div>

      {notaQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : notaQuery.isError ? (
        <p className="text-sm text-destructive">Falha ao carregar: {errMsg(notaQuery.error)}</p>
      ) : !nota ? (
        <p className="text-sm text-muted-foreground">Nota não encontrada.</p>
      ) : (
        <>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Dados da nota</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Fornecedor: </span>
                <strong>{nota.fornecedor ?? "—"}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Data de emissão: </span>
                <strong>{dataBR(nota.data_emissao)}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Número: </span>
                <strong>{nota.numero ?? "—"}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Origem: </span>
                <strong className="uppercase">{nota.origem}</strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Arquivo: </span>
                <span className="text-xs">{nota.arquivo_nome ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Itens{!itensQuery.isLoading ? ` (${itens.length})` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {itensQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando itens…</p>
              ) : itens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item nesta nota.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                        <TableHead>cProd</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Unid.</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Custo unit.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead>Vínculo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-mono text-xs">{i.cprod}</TableCell>
                          <TableCell className="max-w-[26rem]">
                            <span className="line-clamp-2">{i.descricao}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{i.unidade ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono-num text-muted-foreground">
                            {Number(i.quantidade ?? 1)}
                          </TableCell>
                          <TableCell className="text-right font-mono-num text-muted-foreground">
                            {formatCurrency(Number(i.custo_unitario))}
                          </TableCell>
                          <TableCell className="text-right font-mono-num">
                            {formatCurrency(Number(i.custo_unitario) * Number(i.quantidade ?? 1))}
                          </TableCell>
                          <TableCell>
                            {i.produto_mestre_id ? (
                              <span className="text-xs text-emerald-600">vinculado</span>
                            ) : (
                              <span className="text-xs text-amber-600">pendente</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-right text-sm">
                    Total da nota:{" "}
                    <strong className="font-mono-num">{formatCurrency(total)}</strong>
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
