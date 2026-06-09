import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
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
import PriceBadge from "@/components/PriceBadge";
import { createProdutoMestre } from "@/repositories/produtosMestreRepo";
import { useProdutosResolvidos, type LinhaProduto } from "@/hooks/useProdutosResolvidos";
import { formatMargem, formatMoeda } from "@/lib/produtoFormat";
import EditarMontadoDialog, {
  type ProdutoMontadoRow,
} from "@/components/EditarMontadoDialog";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

const montadoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do produto."),
  codigo: z.string().trim().optional(),
  categoria: z.string().trim().optional(),
});

type MontadoForm = z.infer<typeof montadoSchema>;

export default function ProdutoMontado() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<ProdutoMontadoRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const produtosQuery = useProdutosResolvidos();

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
    defaultValues: { nome: "", codigo: "", categoria: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const novo = await createProdutoMestre({
        nome: values.nome,
        codigo: values.codigo ? values.codigo : null,
        categoria: values.categoria ? values.categoria : null,
        tipo: "montado",
      });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      toast.success(`Produto montado "${values.nome}" criado. Adicione os componentes.`);
      reset({ nome: "", codigo: "", categoria: "" });
      // Abre direto a composição do novo produto.
      setEditando(novo);
      setDialogOpen(true);
    } catch (err) {
      toast.error(`Falha ao criar produto: ${errMsg(err)}`);
    }
  });

  const abrirEdicao = (linha: LinhaProduto) => {
    setEditando({
      id: linha.id,
      nome: linha.nome,
      codigo: linha.codigo ?? null,
      categoria: linha.categoria ?? null,
      tipo: "montado",
      custo_manual: linha.custoManual ?? null,
      preco_manual: linha.precoManual ?? null,
      unidade: linha.unidade ?? null,
      unidade_secundaria: linha.unidadeSecundaria ?? null,
      fator_conversao: linha.fatorConversao ?? null,
      mais_vendido: linha.maisVendido,
      created_at: "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Produto montado</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Produtos compostos por outros produtos Nomus. O custo soma os componentes e o preço sai
          do markup (impostos + lucro). Você pode travar um preço manual se quiser.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Novo produto montado</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" placeholder="Ex.: Combo Studio Classic" {...register("nome")} />
                {errors.nome && (
                  <span className="text-xs text-destructive">{errors.nome.message}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="codigo">Código</Label>
                <Input id="codigo" placeholder="Ex.: KIT.V5.130" {...register("codigo")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoria">Categoria/Grupo</Label>
                <Input id="categoria" placeholder="Ex.: 01 - PRODUTO ACABADO" {...register("categoria")} />
              </div>
            </div>
            <div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Criando…" : "Criar e montar composição"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
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
                <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Custo (composição)</TableHead>
                  <TableHead className="text-right">Preço de venda</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {montados.map((p) => {
                  const r = p.resolvido;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono-num text-muted-foreground">
                        {p.codigo ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell>{p.categoria ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono-num text-muted-foreground">
                        {formatMoeda(r.custoBase)}
                      </TableCell>
                      <TableCell className="text-right font-mono-num font-semibold text-foreground">
                        {formatMoeda(r.precoVenda)}
                      </TableCell>
                      <TableCell className="text-right font-mono-num text-muted-foreground">
                        {formatMargem(r.margemPercent)}
                      </TableCell>
                      <TableCell>
                        <PriceBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)}>
                          Composição
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

      <EditarMontadoDialog produto={editando} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
