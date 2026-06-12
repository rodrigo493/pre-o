import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { listVinculos, upsertVinculo } from "@/repositories/vinculosRepo";
import { listProdutosMestre } from "@/repositories/produtosMestreRepo";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function Vinculos() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");

  const vinculosQuery = useQuery({ queryKey: ["vinculos"], queryFn: listVinculos });
  const produtosQuery = useQuery({ queryKey: ["produtos-mestre"], queryFn: listProdutosMestre });

  const produtoPorId = useMemo(() => {
    const m = new Map<string, { nome: string; codigo: string | null }>();
    for (const p of produtosQuery.data ?? []) m.set(p.id, { nome: p.nome, codigo: p.codigo });
    return m;
  }, [produtosQuery.data]);

  const vinculos = vinculosQuery.data ?? [];

  const filtrados = useMemo(() => {
    const q = normalize(busca.trim());
    const lista = vinculos.map((v) => ({
      ...v,
      produtoNome: produtoPorId.get(v.produtoMestreId)?.nome ?? "(produto removido)",
      produtoCodigo: produtoPorId.get(v.produtoMestreId)?.codigo ?? null,
    }));
    if (!q) return lista;
    return lista.filter((v) => normalize(`${v.cprod} ${v.produtoNome}`).includes(q));
  }, [vinculos, produtoPorId, busca]);

  const salvarFator = async (cprod: string, produtoMestreId: string, valor: string) => {
    const t = valor.trim();
    const fator = t === "" ? null : Number(t.replace(",", "."));
    if (fator != null && (!Number.isFinite(fator) || fator <= 0)) {
      toast.error("Fator inválido (use um número maior que zero, ou vazio para remover).");
      return;
    }
    try {
      await upsertVinculo(cprod, produtoMestreId, fator);
      queryClient.invalidateQueries({ queryKey: ["vinculos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success(fator == null ? "Fator removido." : `Fator ${fator} salvo para ${cprod}.`);
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    }
  };

  const loading = vinculosQuery.isLoading || produtosQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vínculos</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Itens de nota já vinculados (por código do fornecedor). Defina o <strong>fator de
          conversão</strong> de cada um — o custo real por unidade é o valor da nota ÷ fator (ex.:
          parafuso em cento → fator 100).
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="gap-3">
          <CardTitle className="text-base font-semibold">
            Vínculos{!loading ? ` (${busca ? `${filtrados.length}/` : ""}${vinculos.length})` : ""}
          </CardTitle>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código ou produto…"
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : vinculos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vínculo memorizado ainda.</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vínculo encontrado para “{busca}”.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                  <TableHead>cProd (fornecedor)</TableHead>
                  <TableHead>Produto vinculado</TableHead>
                  <TableHead className="text-center">Fator de conversão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((v) => (
                  <TableRow key={v.cprod}>
                    <TableCell className="font-mono text-xs">{v.cprod}</TableCell>
                    <TableCell>
                      <span className="font-medium">{v.produtoNome}</span>
                      {v.produtoCodigo && (
                        <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                          {v.produtoCodigo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="0"
                        step="0.0001"
                        inputMode="decimal"
                        defaultValue={v.fatorConversao != null ? String(v.fatorConversao) : ""}
                        placeholder="ex.: 100"
                        onBlur={(e) => void salvarFator(v.cprod, v.produtoMestreId, e.target.value)}
                        className="mx-auto h-8 w-28 text-center"
                      />
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
