import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  pendentesComMesmoCprod,
  normalizeCprod,
  construirMapaDescricao,
  aplicarAutoVinculoPorDescricao,
} from "@/lib/autoLink";
import type { Database } from "@/integrations/supabase/types";

type ItemRow = Database["public"]["Tables"]["itens_nota"]["Row"];

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

export default function Vincular() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [busca, setBusca] = useState("");

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

  const pendentesFiltrados = useMemo(() => {
    const q = busca
      .trim()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    if (!q) return pendentes;
    return pendentes.filter((it) => {
      const alvo = `${it.cprod} ${it.descricao}`
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      return alvo.includes(q);
    });
  }, [pendentes, busca]);

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
  const linkToMestre = async (
    item: ItemRow,
    mestreId: string,
    lote: boolean,
    fator: number | null,
  ) => {
    setBusyId(item.id);
    try {
      const alvos = lote
        ? [item, ...pendentesComMesmoCprod(item, pendentes)]
        : [item];

      for (const alvo of alvos) {
        await vincularItem(alvo.id, mestreId);
      }
      // Memoriza o cprod (e o fator de conversão) uma única vez.
      await upsertVinculo(item.cprod, mestreId, fator);

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

  const handleVincularExistente = (
    item: ItemRow,
    mestreId: string,
    lote: boolean,
    fator: number | null,
  ) => {
    void linkToMestre(item, mestreId, lote, fator);
  };

  /** Vincula em massa todos os pendentes com descrição IDÊNTICA a um produto oficial. */
  const autoVincularDescricao = async () => {
    const mapa = construirMapaDescricao(mestres.map((m) => ({ id: m.id, nome: m.nome })));
    const { vinculados } = aplicarAutoVinculoPorDescricao(
      pendentes.map((p) => ({ id: p.id, descricao: p.descricao })),
      mapa,
    );
    if (vinculados.length === 0) {
      toast.info("Nenhum pendente com descrição idêntica a um produto.");
      return;
    }
    setAutoBusy(true);
    try {
      const porId = new Map(pendentes.map((p) => [p.id, p]));
      const memo = new Set<string>();
      for (const v of vinculados) {
        await vincularItem(v.id, v.produtoMestreId);
        const it = porId.get(v.id);
        if (it && it.cprod && !memo.has(normalizeCprod(it.cprod))) {
          memo.add(normalizeCprod(it.cprod));
          await upsertVinculo(it.cprod, v.produtoMestreId);
        }
      }
      invalidate();
      toast.success(`${vinculados.length} item(ns) vinculados por descrição idêntica.`);
    } catch (err) {
      toast.error(`Falha no auto-vínculo: ${errMsg(err)}`);
    } finally {
      setAutoBusy(false);
    }
  };

  const handleCriarMestre = async (
    item: ItemRow,
    nome: string,
    lote: boolean,
    fator: number | null,
  ) => {
    setBusyId(item.id);
    try {
      const mestre = await createProdutoMestre({ nome, tipo: "comprado" });
      await linkToMestre(item, mestre.id, lote, fator);
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
          À <strong>esquerda</strong>, os itens das suas <strong>notas fiscais</strong> (ainda sem
          produto). À <strong>direita</strong>, escolha o <strong>produto oficial do catálogo
          Nomus</strong> para vincular. O código (cProd) fica memorizado para auto-vincular nas
          próximas notas.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold">
              Fila de pendentes
              {!loading ? ` (${busca ? `${pendentesFiltrados.length}/` : ""}${pendentes.length})` : ""}
            </CardTitle>
            {pendentes.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={autoBusy || mestres.length === 0}
                onClick={() => void autoVincularDescricao()}
              >
                {autoBusy ? "Vinculando…" : "Auto-vincular idênticos"}
              </Button>
            )}
          </div>
          {pendentes.length > 0 && (
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar item da nota (código ou descrição)…"
              className="max-w-sm"
            />
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item pendente de vínculo.
            </p>
          ) : pendentesFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item encontrado para “{busca}”.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&_th]:text-center [&_th]:text-[11px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide">
                  <TableHead colSpan={4} className="border-r bg-muted/50 text-foreground">
                    Nota Fiscal
                  </TableHead>
                  <TableHead className="bg-primary/5 text-primary">
                    Produto Nomus (catálogo)
                  </TableHead>
                </TableRow>
                <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                  <TableHead>cProd</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="border-r">Unid.</TableHead>
                  <TableHead>Vincular a</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentesFiltrados.map((item) => (
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
