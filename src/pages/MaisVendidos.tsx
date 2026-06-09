import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";
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
import PriceBadge from "@/components/PriceBadge";
import { useProdutosResolvidos, type LinhaProduto } from "@/hooks/useProdutosResolvidos";
import { updateProdutoMestre } from "@/repositories/produtosMestreRepo";
import { formatMoeda } from "@/lib/produtoFormat";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

export default function MaisVendidos() {
  const queryClient = useQueryClient();
  const produtosQuery = useProdutosResolvidos();
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const linhas = produtosQuery.data ?? [];
  const maisVendidos = useMemo(
    () =>
      linhas
        .filter((l) => l.maisVendido)
        .sort((a, b) => (b.resolvido.precoVenda ?? 0) - (a.resolvido.precoVenda ?? 0)),
    [linhas],
  );

  const remover = async (linha: LinhaProduto) => {
    setRemovendoId(linha.id);
    try {
      await updateProdutoMestre(linha.id, { mais_vendido: false });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success("Removido dos mais vendidos.");
    } catch (err) {
      toast.error(`Falha ao remover: ${errMsg(err)}`);
    } finally {
      setRemovendoId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Star className="h-4 w-4 fill-current" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mais vendidos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Produtos marcados como mais vendidos, ordenados pelo preço de venda. Marque/desmarque
            pela estrela na tela de Produtos.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Mais vendidos{!produtosQuery.isLoading ? ` (${maisVendidos.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {produtosQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : produtosQuery.isError ? (
            <p className="text-sm text-destructive">
              Falha ao carregar: {errMsg(produtosQuery.error)}
            </p>
          ) : maisVendidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum produto marcado como mais vendido. Vá em <strong>Produtos</strong> e clique na
              estrela do produto.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Preço venda</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right no-print">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maisVendidos.map((linha) => (
                  <TableRow key={linha.id}>
                    <TableCell className="font-mono-num text-muted-foreground">
                      {linha.codigo ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{linha.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {linha.categoria ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono-num font-semibold text-foreground">
                      {formatMoeda(linha.resolvido.precoVenda)}
                    </TableCell>
                    <TableCell>
                      <PriceBadge status={linha.resolvido.status} />
                    </TableCell>
                    <TableCell className="text-right no-print">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removendoId === linha.id}
                        onClick={() => void remover(linha)}
                      >
                        Remover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
