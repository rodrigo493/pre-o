import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");

  const notasQuery = useQuery({ queryKey: ["notas"], queryFn: listNotas });
  const notas = notasQuery.data ?? [];

  const filtradas = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return notas;
    return notas.filter((n) =>
      normalize(`${n.fornecedor ?? ""} ${n.numero ?? ""} ${n.arquivo_nome ?? ""}`).includes(q),
    );
  }, [notas, busca]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notas fiscais</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Notas importadas. Clique numa nota para abrir os itens e valores dela.
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
                    onClick={() => navigate(`/notas/${n.id}`)}
                    className="cursor-pointer hover:bg-accent"
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
    </div>
  );
}
