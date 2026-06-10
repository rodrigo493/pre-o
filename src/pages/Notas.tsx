import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { listNotas } from "@/repositories/notasRepo";
import { listItensPorNota } from "@/repositories/itensNotaRepo";
import { formatCurrency } from "@/lib/pricing";
import type { Database } from "@/integrations/supabase/types";

type NotaRow = Database["public"]["Tables"]["notas"]["Row"];

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function dataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function Notas() {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<NotaRow | null>(null);

  const notasQuery = useQuery({ queryKey: ["notas"], queryFn: listNotas });
  const itensQuery = useQuery({
    queryKey: ["itens-nota", sel?.id],
    queryFn: () => listItensPorNota(sel!.id),
    enabled: !!sel,
  });

  const notas = notasQuery.data ?? [];
  const filtradas = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return notas;
    return notas.filter((n) =>
      normalize(`${n.fornecedor ?? ""} ${n.numero ?? ""} ${n.arquivo_nome ?? ""}`).includes(q),
    );
  }, [notas, busca]);

  const itens = itensQuery.data ?? [];
  const totalNota = itens.reduce(
    (s, i) => s + Number(i.custo_unitario) * Number(i.quantidade ?? 1),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notas fiscais</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Notas importadas. Clique numa nota para ver os itens dela.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="gap-3">
          <CardTitle className="text-base font-semibold">
            Notas{!notasQuery.isLoading ? ` (${busca ? `${filtradas.length}/` : ""}${notas.length})` : ""}
          </CardTitle>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor, número ou arquivo…"
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          {notasQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : notasQuery.isError ? (
            <p className="text-sm text-destructive">Falha ao carregar: {errMsg(notasQuery.error)}</p>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma nota encontrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                  <TableHead>Data</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Arquivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((n) => (
                  <TableRow
                    key={n.id}
                    onClick={() => setSel(n)}
                    className={`cursor-pointer ${sel?.id === n.id ? "bg-accent" : ""}`}
                  >
                    <TableCell className="font-mono-num text-muted-foreground">
                      {dataBR(n.data_emissao)}
                    </TableCell>
                    <TableCell>{n.numero ?? "—"}</TableCell>
                    <TableCell className="font-medium">{n.fornecedor ?? "—"}</TableCell>
                    <TableCell className="uppercase text-xs text-muted-foreground">
                      {n.origem}
                    </TableCell>
                    <TableCell className="max-w-[18rem] truncate text-xs text-muted-foreground">
                      {n.arquivo_nome ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {sel && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Itens da nota {sel.numero ? `nº ${sel.numero}` : ""} — {sel.fornecedor ?? "sem fornecedor"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {itensQuery.isLoading ? (
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
                      <TableHead>Unid.</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Custo unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead>Vínculo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.cprod}</TableCell>
                        <TableCell className="max-w-[24rem]">
                          <span className="line-clamp-2">{i.descricao}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{i.unidade ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono-num text-muted-foreground">
                          {Number(i.quantidade ?? 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono-num text-muted-foreground">
                          {formatCurrency(Number(i.custo_unitario))}
                        </TableCell>
                        <TableCell className="text-right font-mono-num">
                          {formatCurrency(Number(i.custo_unitario) * Number(i.quantidade ?? 1))}
                        </TableCell>
                        <TableCell>
                          {i.produto_mestre_id ? (
                            <span className="text-xs text-emerald-600">vinculado</span>
                          ) : (
                            <span className="text-xs text-amber-600">pendente</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-3 text-right text-sm">
                  Total da nota:{" "}
                  <strong className="font-mono-num">{formatCurrency(totalNota)}</strong>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
