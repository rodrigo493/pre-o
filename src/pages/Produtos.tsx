import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PriceBadge from "@/components/PriceBadge";
import EditarPrecoDialog from "@/components/EditarPrecoDialog";
import { useProdutosResolvidos, type LinhaProduto } from "@/hooks/useProdutosResolvidos";
import { formatMargem, formatMoeda, formatOrigem } from "@/lib/produtoFormat";

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
    return linhas.filter((l) => l.nome.toLowerCase().includes(q));
  }, [linhas, busca]);

  const abrirEdicao = (linha: LinhaProduto) => {
    setEditando(linha);
    setDialogOpen(true);
  };

  const exportarEmBreve = () => toast.info("Exportação chega na Task 3.7.");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Preços resolvidos a partir do maior custo dos últimos 3 meses (comprados)
            ou do preço manual (montados / travados).
          </p>
        </div>
        <TooltipProvider>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" disabled onClick={exportarEmBreve}>
                    Exportar Excel
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>em breve (Task 3.7)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" disabled onClick={exportarEmBreve}>
                    Exportar PDF
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>em breve (Task 3.7)</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">
            Tabela de preços{!produtosQuery.isLoading ? ` (${filtradas.length})` : ""}
          </CardTitle>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome…"
            className="max-w-sm"
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
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Maior custo</TableHead>
                  <TableHead className="text-right">Preço venda</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Nº notas (3m)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((linha) => {
                  const r = linha.resolvido;
                  return (
                    <TableRow key={linha.id}>
                      <TableCell className="font-medium">{linha.nome}</TableCell>
                      <TableCell>{linha.categoria ?? "—"}</TableCell>
                      <TableCell className="capitalize">{linha.tipo}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoeda(r.custoBase)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoeda(r.precoVenda)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMargem(r.margemPercent)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatOrigem(r.origem)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.numNotasPeriodo}
                      </TableCell>
                      <TableCell>
                        <PriceBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
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
