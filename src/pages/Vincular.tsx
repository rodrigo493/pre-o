import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import VincularRow from "@/components/VincularRow";
import { listItensPendentes, vincularItem } from "@/repositories/itensNotaRepo";
import { listProdutosMestre, createProdutoMestre } from "@/repositories/produtosMestreRepo";
import { upsertVinculo } from "@/repositories/vinculosRepo";
import { pendentesComMesmoCprod, normalizeCprod } from "@/lib/autoLink";
import type { Database } from "@/integrations/supabase/types";

type ItemRow = Database["public"]["Tables"]["itens_nota"]["Row"];

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

export default function Vincular() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendentesQuery = useQuery({
    queryKey: ["pendentes"],
    queryFn: listItensPendentes,
  });
  const mestresQuery = useQuery({
    queryKey: ["produtos-mestre"],
    queryFn: listProdutosMestre,
  });

  const pendentes = pendentesQuery.data ?? [];
  const mestres = mestresQuery.data ?? [];

  useEffect(() => {
    if (pendentesQuery.isError) {
      toast.error(`Falha ao carregar pendentes: ${errMsg(pendentesQuery.error)}`);
    }
  }, [pendentesQuery.isError]);

  useEffect(() => {
    if (mestresQuery.isError) {
      toast.error(`Falha ao carregar produtos: ${errMsg(mestresQuery.error)}`);
    }
  }, [mestresQuery.isError]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pendentes"] });
    queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
    queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
  };

  /** Vincula o item (e, se lote, os outros pendentes com mesmo cprod) ao mestre. */
  const linkToMestre = async (item: ItemRow, mestreId: string, lote: boolean) => {
    setBusyId(item.id);
    try {
      const alvos = lote
        ? [item, ...pendentesComMesmoCprod(item, pendentes)]
        : [item];

      for (const alvo of alvos) {
        await vincularItem(alvo.id, mestreId);
      }
      // Memoriza o cprod uma única vez (normalizado dentro do repo).
      await upsertVinculo(item.cprod, mestreId);

      invalidate();
      const extra = alvos.length - 1;
      toast.success(
        extra > 0
          ? `Item vinculado + ${extra} com código ${normalizeCprod(item.cprod)}.`
          : "Item vinculado.",
      );
    } catch (err) {
      toast.error(`Falha ao vincular: ${errMsg(err)}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleVincularExistente = (item: ItemRow, mestreId: string, lote: boolean) => {
    void linkToMestre(item, mestreId, lote);
  };

  const handleCriarMestre = async (item: ItemRow, nome: string, lote: boolean) => {
    setBusyId(item.id);
    try {
      const mestre = await createProdutoMestre({ nome, tipo: "comprado" });
      await linkToMestre(item, mestre.id, lote);
    } catch (err) {
      toast.error(`Falha ao criar mestre: ${errMsg(err)}`);
    } finally {
      setBusyId(null);
    }
  };

  const loading = pendentesQuery.isLoading || mestresQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vincular itens</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Ligue cada item importado a um produto mestre. O código (cProd) fica memorizado
          para auto-vincular nas próximas notas.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Fila de pendentes{!loading ? ` (${pendentes.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item pendente de vínculo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                  <TableHead>cProd</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Custo unit.</TableHead>
                  <TableHead>Unid.</TableHead>
                  <TableHead>Vincular a</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map((item) => (
                  <VincularRow
                    key={item.id}
                    item={item}
                    mestres={mestres}
                    outrosMesmoCprod={pendentesComMesmoCprod(item, pendentes).length}
                    busy={busyId === item.id}
                    onVincularExistente={handleVincularExistente}
                    onCriarMestre={handleCriarMestre}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
