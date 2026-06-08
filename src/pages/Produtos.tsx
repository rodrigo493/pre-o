import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PriceBadge from "@/components/PriceBadge";
import EditarPrecoDialog from "@/components/EditarPrecoDialog";
import { useProdutosResolvidos, type LinhaProduto } from "@/hooks/useProdutosResolvidos";
import { formatMargem, formatMoeda, formatOrigem } from "@/lib/produtoFormat";
import { exportarXlsx } from "@/lib/exportXlsx";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

export default function Produtos() {
  const produtosQuery = useProdutosResolvidos();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<LinhaProduto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const linhas = produtosQuery.data ?? [];

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter(
      (l) =>
        l.nome.toLowerCase().includes(q) ||
        (l.codigo ?? "").toLowerCase().includes(q),
    );
  }, [linhas, busca]);

  const abrirEdicao = (linha: LinhaProduto) => {
    setEditando(linha);
    setDialogOpen(true);
  };

  const exportarExcel = () => {
    if (filtradas.length === 0) {
      toast.info("Nenhum produto para exportar.");
      return;
    }
    try {
      exportarXlsx(filtradas);
    } catch (err) {
      toast.error(`Falha ao exportar Excel: ${errMsg(err)}`);
    }
  };

  const exportarPdf = () => window.print();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3 no-print">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Tag className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Preços resolvidos a partir do maior custo dos últimos 3 meses (comprados)
              ou do preço manual (montados / travados).
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-lg"
            onClick={exportarExcel}
            disabled={produtosQuery.isLoading || filtradas.length === 0}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
          <Button
            variant="outline"
            className="rounded-lg"
            onClick={exportarPdf}
            disabled={produtosQuery.isLoading || filtradas.length === 0}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <Card id="print-area" className="rounded-2xl shadow-sm">
        <div className="hidden print:block px-6 pt-6">
          <h2 className="text-lg font-semibold">Tabela de Preços — Live</h2>
          <p className="text-sm text-muted-foreground">
            Gerado em {new Date().toLocaleDateString("pt-BR")}
          </p>
        </div>
        <CardHeader className="gap-3">
          <CardTitle className="text-base font-semibold">
            Tabela de preços{!produtosQuery.isLoading ? ` (${filtradas.length})` : ""}
          </CardTitle>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou código…"
            className="max-w-sm no-print"
          />
        </CardHeader>
        <CardContent>
          {produtosQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : produtosQuery.isError ? (
            <p className="text-sm text-destructive">
              Falha ao carregar produtos: {errMsg(produtosQuery.error)}
            </p>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum produto cadastrado ainda.
            </p>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum produto encontrado para “{busca}”.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Maior custo</TableHead>
                  <TableHead className="text-right">Preço venda</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Nº notas (3m)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right no-print">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((linha) => {
                  const r = linha.resolvido;
                  return (
                    <TableRow key={linha.id}>
                      <TableCell className="font-mono-num text-muted-foreground">
                        {linha.codigo ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">{linha.nome}</TableCell>
                      <TableCell>{linha.categoria ?? "—"}</TableCell>
                      <TableCell className="capitalize">{linha.tipo}</TableCell>
                      <TableCell className="text-right font-mono-num text-muted-foreground">
                        {formatMoeda(r.custoBase)}
                      </TableCell>
                      <TableCell className="text-right font-mono-num font-semibold text-foreground">
                        {formatMoeda(r.precoVenda)}
                      </TableCell>
                      <TableCell className="text-right font-mono-num text-muted-foreground">
                        {formatMargem(r.margemPercent)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatOrigem(r.origem)}
                      </TableCell>
                      <TableCell className="text-right font-mono-num text-muted-foreground">
                        {r.numNotasPeriodo}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <PriceBadge status={r.status} />
                          {r.conversaoPendente && (
                            <span className="text-[11px] font-medium text-amber-600">
                              conversão pendente
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right no-print">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirEdicao(linha)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EditarPrecoDialog
        linha={editando}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
