import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
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
import VincularRow, { type ConversaoOp } from "@/components/VincularRow";
import { getNotaById } from "@/repositories/notasRepo";
import {
  listItensPorNota,
  vincularItensPorCprod,
} from "@/repositories/itensNotaRepo";
import { listProdutosMestre, createProdutoMestre, updateProdutoMestre } from "@/repositories/produtosMestreRepo";
import { upsertVinculo } from "@/repositories/vinculosRepo";
import { formatCurrency } from "@/lib/pricing";
import type { Database } from "@/integrations/supabase/types";

type ItemRow = Database["public"]["Tables"]["itens_nota"]["Row"];

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}
function dataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function NotaDetalhe() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<Set<string>>(new Set());

  const notaQuery = useQuery({ queryKey: ["nota", id], queryFn: () => getNotaById(id), enabled: !!id });
  const itensQuery = useQuery({
    queryKey: ["itens-nota", id],
    queryFn: () => listItensPorNota(id),
    enabled: !!id,
  });
  const mestresQuery = useQuery({ queryKey: ["produtos-mestre"], queryFn: listProdutosMestre });

  const nota = notaQuery.data;
  const itens = itensQuery.data ?? [];
  const mestres = mestresQuery.data ?? [];
  const nomePorId = useMemo(() => new Map(mestres.map((m) => [m.id, m])), [mestres]);
  const total = itens.reduce((s, i) => s + Number(i.custo_unitario) * Number(i.quantidade ?? 1), 0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["itens-nota", id] });
    queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
    queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
    queryClient.invalidateQueries({ queryKey: ["pendentes"] });
  };

  const vincular = async (
    item: ItemRow,
    mestreId: string,
    fator: number | null,
    op: ConversaoOp,
  ) => {
    setBusyId(item.id);
    try {
      const n = await vincularItensPorCprod(item.cprod, mestreId);
      await upsertVinculo(item.cprod, mestreId, null);
      if (fator != null) {
        await updateProdutoMestre(mestreId, { fator_conversao: fator, conversao_op: op });
      }
      setTrocando((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      invalidate();
      toast.success(
        n > 1
          ? `Vinculado — ${n} itens com o código ${item.cprod} (todas as notas).`
          : "Item vinculado.",
      );
    } catch (err) {
      toast.error(`Falha ao vincular: ${errMsg(err)}`);
    } finally {
      setBusyId(null);
    }
  };

  const criarEVincular = async (
    item: ItemRow,
    nome: string,
    fator: number | null,
    op: ConversaoOp,
  ) => {
    setBusyId(item.id);
    try {
      const mestre = await createProdutoMestre({ nome, tipo: "comprado" });
      await vincular(item, mestre.id, fator, op);
    } catch (err) {
      toast.error(`Falha ao criar mestre: ${errMsg(err)}`);
      setBusyId(null);
    }
  };

  const pendentesCount = itens.filter((i) => !i.produto_mestre_id).length;

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
              <div><span className="text-muted-foreground">Fornecedor: </span><strong>{nota.fornecedor ?? "—"}</strong></div>
              <div><span className="text-muted-foreground">Data de emissão: </span><strong>{dataBR(nota.data_emissao)}</strong></div>
              <div><span className="text-muted-foreground">Número: </span><strong>{nota.numero ?? "—"}</strong></div>
              <div><span className="text-muted-foreground">Origem: </span><strong className="uppercase">{nota.origem}</strong></div>
              <div className="sm:col-span-2"><span className="text-muted-foreground">Arquivo: </span><span className="text-xs">{nota.arquivo_nome ?? "—"}</span></div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Itens{!itensQuery.isLoading ? ` (${itens.length})` : ""}
                {pendentesCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-amber-600">
                    {pendentesCount} para vincular
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Vincule cada item ao código do catálogo. Ao vincular, vale para <strong>todas as
                notas</strong> com esse mesmo código (passadas e futuras).
              </p>
            </CardHeader>
            <CardContent>
              {itensQuery.isLoading || mestresQuery.isLoading ? (
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
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead>Unid.</TableHead>
                        <TableHead>Vincular a</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item) => {
                        const linkado = item.produto_mestre_id
                          ? nomePorId.get(item.produto_mestre_id)
                          : null;
                        const editando = trocando.has(item.id) || !item.produto_mestre_id;
                        if (editando) {
                          return (
                            <VincularRow
                              key={item.id}
                              item={item}
                              mestres={mestres}
                              outrosMesmoCprod={0}
                              busy={busyId === item.id}
                              onVincularExistente={(it, mestreId, _lote, fator, op) => void vincular(it, mestreId, fator, op)}
                              onCriarMestre={(it, nome, _lote, fator, op) => void criarEVincular(it, nome, fator, op)}
                            />
                          );
                        }
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs">{item.cprod}</TableCell>
                            <TableCell className="max-w-[24rem]">
                              <span className="line-clamp-2">{item.descricao}</span>
                            </TableCell>
                            <TableCell className="text-right font-mono-num text-muted-foreground">
                              {formatCurrency(Number(item.custo_unitario))}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{item.unidade ?? "—"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-emerald-600">
                                  ✓ {linkado ? `${linkado.codigo ? `${linkado.codigo} · ` : ""}${linkado.nome}` : "vinculado"}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setTrocando((prev) => new Set(prev).add(item.id))
                                  }
                                >
                                  Trocar
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-right text-sm">
                    Total da nota: <strong className="font-mono-num">{formatCurrency(total)}</strong>
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
