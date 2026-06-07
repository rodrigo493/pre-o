import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listProdutosMestre,
  createProdutoMestre,
} from "@/repositories/produtosMestreRepo";
import { formatCurrency } from "@/lib/pricing";
import EditarMontadoDialog, {
  type ProdutoMontadoRow,
} from "@/components/EditarMontadoDialog";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

const montadoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do produto."),
  categoria: z.string().trim().optional(),
  custoManual: z
    .number({ invalid_type_error: "Custo inválido." })
    .min(0, "Custo não pode ser negativo.")
    .optional(),
  precoManual: z
    .number({ invalid_type_error: "Informe um preço." })
    .positive("O preço de venda deve ser maior que zero."),
});

type MontadoForm = z.infer<typeof montadoSchema>;

function margemSobrePreco(custo: number, preco: number): number {
  return ((preco - custo) / preco) * 100;
}

export default function ProdutoMontado() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<ProdutoMontadoRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const produtosQuery = useQuery({
    queryKey: ["produtos-mestre"],
    queryFn: listProdutosMestre,
  });

  const montados = useMemo(
    () => (produtosQuery.data ?? []).filter((p) => p.tipo === "montado"),
    [produtosQuery.data],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MontadoForm>({
    resolver: zodResolver(montadoSchema),
    defaultValues: { nome: "", categoria: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createProdutoMestre({
        nome: values.nome,
        categoria: values.categoria ? values.categoria : null,
        tipo: "montado",
        custo_manual: values.custoManual ?? null,
        preco_manual: values.precoManual,
      });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      toast.success(`Produto montado "${values.nome}" criado.`);
      reset({ nome: "", categoria: "", custoManual: undefined, precoManual: undefined });
    } catch (err) {
      toast.error(`Falha ao criar produto: ${errMsg(err)}`);
    }
  });

  const abrirEdicao = (linha: ProdutoMontadoRow) => {
    setEditando(linha);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Produto montado</h1>
        <p className="text-sm text-muted-foreground">
          Produtos com custo e preço definidos manualmente (sem markup automático).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo produto montado</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" placeholder="Ex.: Reformer montado" {...register("nome")} />
                {errors.nome && (
                  <span className="text-xs text-destructive">{errors.nome.message}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoria">Categoria</Label>
                <Input id="categoria" placeholder="Ex.: Equipamentos" {...register("categoria")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="custoManual">Custo manual (R$)</Label>
                <Input
                  id="custoManual"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  {...register("custoManual", { valueAsNumber: true })}
                />
                {errors.custoManual && (
                  <span className="text-xs text-destructive">{errors.custoManual.message}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="precoManual">Preço de venda (R$) *</Label>
                <Input
                  id="precoManual"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  {...register("precoManual", { valueAsNumber: true })}
                />
                {errors.precoManual && (
                  <span className="text-xs text-destructive">{errors.precoManual.message}</span>
                )}
              </div>
            </div>
            <div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando…" : "Criar produto montado"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Produtos montados{!produtosQuery.isLoading ? ` (${montados.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {produtosQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : produtosQuery.isError ? (
            <p className="text-sm text-destructive">
              Falha ao carregar produtos: {errMsg(produtosQuery.error)}
            </p>
          ) : montados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum produto montado cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Custo manual</TableHead>
                  <TableHead className="text-right">Preço de venda</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {montados.map((p) => {
                  const custo = p.custo_manual;
                  const preco = p.preco_manual;
                  const margem =
                    custo != null && preco != null && preco > 0
                      ? margemSobrePreco(custo, preco)
                      : null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell>{p.categoria ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {custo != null ? formatCurrency(custo) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {preco != null ? formatCurrency(preco) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {margem != null ? `${margem.toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)}>
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

      <EditarMontadoDialog
        produto={editando}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
