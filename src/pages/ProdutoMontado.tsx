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
import { createProdutoMestre, updateProdutoMestre } from "@/repositories/produtosMestreRepo";
import { useProdutosResolvidos, type LinhaProduto } from "@/hooks/useProdutosResolvidos";
import { GRUPO_MONTADO } from "@/lib/grupos";
import { formatMargem, formatMoeda } from "@/lib/produtoFormat";
import EditarMontadoDialog, {
  type ProdutoMontadoRow,
} from "@/components/EditarMontadoDialog";
import ImportarFichaDialog from "@/components/ImportarFichaDialog";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

const montadoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do produto."),
  codigo: z.string().trim().optional(),
});

type MontadoForm = z.infer<typeof montadoSchema>;

export default function ProdutoMontado() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<ProdutoMontadoRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const produtosQuery = useProdutosResolvidos();

  // Só os montados criados aqui: com composição cadastrada OU preço manual travado.
  // (Os milhares de montados do catálogo sem composição ficam fora da lista.)
  const montados = useMemo(
    () =>
      (produtosQuery.data ?? []).filter(
        (p) => p.tipo === "montado" && (p.temComposicao || p.precoManual != null),
      ),
    [produtosQuery.data],
  );

  const linhaParaRow = (l: LinhaProduto): ProdutoMontadoRow => ({
    id: l.id, nome: l.nome, codigo: l.codigo ?? null, categoria: l.categoria ?? null,
    tipo: "montado", custo_manual: l.custoManual ?? null, preco_manual: l.precoManual ?? null,
    unidade: l.unidade ?? null, unidade_secundaria: l.unidadeSecundaria ?? null,
    fator_conversao: l.fatorConversao ?? null, conversao_op: l.conversaoOp ?? null,
    soma_nota: l.somaNota ?? false, tempo_corte_min: l.tempoCorteMin ?? null,
    mais_vendido: l.maisVendido, created_at: "",
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MontadoForm>({
    resolver: zodResolver(montadoSchema),
    defaultValues: { nome: "", codigo: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const codigo = values.codigo ? values.codigo.trim() : null;
      // Todo produto montado aqui fica SEMPRE no grupo "PRODUTO MONTADO".
      const categoria = GRUPO_MONTADO;
      // Find-or-create pelo código: se já existe no catálogo, reusa (vira montado) e abre a
      // composição — evita erro de código duplicado (23505).
      const existente = codigo
        ? (produtosQuery.data ?? []).find(
            (l) => (l.codigo ?? "").trim().toUpperCase() === codigo.toUpperCase(),
          )
        : undefined;

      let row: ProdutoMontadoRow;
      if (existente) {
        await updateProdutoMestre(existente.id, { nome: values.nome, categoria, tipo: "montado" });
        row = { ...linhaParaRow(existente), nome: values.nome, categoria };
        toast.success(`"${values.nome}" já existia no catálogo — abrindo a composição.`);
      } else {
        row = await createProdutoMestre({ nome: values.nome, codigo, categoria, tipo: "montado" });
        toast.success(`Produto montado "${values.nome}" criado. Adicione os componentes.`);
      }
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      reset({ nome: "", codigo: "" });
      setEditando(row);
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
      conversao_op: linha.conversaoOp ?? null,
      soma_nota: linha.somaNota ?? false,
      tempo_corte_min: linha.tempoCorteMin ?? null,
      mais_vendido: linha.maisVendido,
      created_at: "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produto montado</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Produtos compostos por outros produtos Nomus. O custo soma os componentes e o preço sai
            do markup (impostos + lucro). Você pode travar um preço manual se quiser.
          </p>
        </div>
        <ImportarFichaDialog />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Novo produto montado</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <p className="text-xs text-muted-foreground">
              Grupo: <strong>{GRUPO_MONTADO}</strong> — todo produto montado aqui entra nesse grupo.
            </p>
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
                      <TableCell className="font-medium">
                        {p.nome}
                        {p.maoDeObraPendente && (
                          <span
                            className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                            title="Soma mão de obra da nota, mas não há nota deste código nos últimos 8 meses — a parcela está valendo R$ 0."
                          >
                            sem nota do serviço
                          </span>
                        )}
                      </TableCell>
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
                        <Button variant="outline" size="sm" onClick={() => abrirEdicao(p)}>
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

      <EditarMontadoDialog produto={editando} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
