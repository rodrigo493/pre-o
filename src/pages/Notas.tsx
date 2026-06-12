import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import NotaConteudo from "@/components/NotaConteudo";
import { listNotas } from "@/repositories/notasRepo";
import { listItensPorNotas, searchItensComNota } from "@/repositories/itensNotaRepo";
import { formatCurrency } from "@/lib/pricing";

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

type Modo = "notas" | "itens";

export default function Notas() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<Modo>("notas");
  const [busca, setBusca] = useState("");
  const [buscaItem, setBuscaItem] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [visualizando, setVisualizando] = useState(false);

  const notasQuery = useQuery({ queryKey: ["notas"], queryFn: listNotas });
  const notas = notasQuery.data ?? [];

  const filtradas = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return notas;
    return notas.filter((n) =>
      normalize(`${n.fornecedor ?? ""} ${n.numero ?? ""} ${n.arquivo_nome ?? ""}`).includes(q),
    );
  }, [notas, busca]);

  const idsSelecionados = useMemo(() => Array.from(selecionadas), [selecionadas]);

  // Busca de itens (server-side ilike) com debounce simples por tamanho mínimo.
  const itensQuery = useQuery({
    queryKey: ["busca-itens", buscaItem.trim()],
    queryFn: () => searchItensComNota(buscaItem.trim()),
    enabled: modo === "itens" && buscaItem.trim().length >= 2,
  });
  const itensEncontrados = itensQuery.data ?? [];

  // Conteúdo das notas selecionadas (na visualização em lote).
  const conteudoQuery = useQuery({
    queryKey: ["itens-por-notas", idsSelecionados],
    queryFn: () => listItensPorNotas(idsSelecionados),
    enabled: visualizando && idsSelecionados.length > 0,
  });
  const itensPorNota = useMemo(() => {
    const dados = conteudoQuery.data ?? [];
    const m = new Map<string, typeof dados>();
    for (const it of dados) {
      const arr = m.get(it.nota_id) ?? [];
      arr.push(it);
      m.set(it.nota_id, arr);
    }
    return m;
  }, [conteudoQuery.data]);

  const toggle = (id: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const todasMarcadas = filtradas.length > 0 && filtradas.every((n) => selecionadas.has(n.id));
  const toggleTodas = () => {
    setSelecionadas((prev) => {
      if (filtradas.every((n) => prev.has(n.id))) {
        const next = new Set(prev);
        for (const n of filtradas) next.delete(n.id);
        return next;
      }
      const next = new Set(prev);
      for (const n of filtradas) next.add(n.id);
      return next;
    });
  };

  // ---- Visualização em lote das notas selecionadas ----
  if (visualizando) {
    const notasSel = notas
      .filter((n) => selecionadas.has(n.id))
      .sort((a, b) => b.data_emissao.localeCompare(a.data_emissao));
    const totalGeral = (conteudoQuery.data ?? []).reduce(
      (s, i) => s + Number(i.custo_unitario) * Number(i.quantidade ?? 1),
      0,
    );
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setVisualizando(false)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar à lista
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">
              {notasSel.length} nota(s) selecionada(s)
            </h1>
          </div>
          <div className="text-right text-sm">
            <span className="text-muted-foreground">Total geral: </span>
            <strong className="font-mono-num">{formatCurrency(totalGeral)}</strong>
          </div>
        </div>

        {conteudoQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando conteúdo…</p>
        ) : conteudoQuery.isError ? (
          <p className="text-sm text-destructive">Falha ao carregar: {errMsg(conteudoQuery.error)}</p>
        ) : (
          notasSel.map((n) => (
            <NotaConteudo key={n.id} nota={n} itens={itensPorNota.get(n.id) ?? []} />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notas fiscais</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Selecione notas e clique em Visualizar para ver o conteúdo de todas juntas, ou troque
          para a busca por item.
        </p>
      </div>

      {/* Alternador de modo */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 text-sm w-fit">
        <button
          onClick={() => setModo("notas")}
          className={`rounded-md px-3 py-1.5 ${modo === "notas" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"}`}
        >
          Notas
        </button>
        <button
          onClick={() => setModo("itens")}
          className={`rounded-md px-3 py-1.5 ${modo === "itens" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"}`}
        >
          Itens
        </button>
      </div>

      {modo === "notas" ? (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold">
                Notas{!notasQuery.isLoading ? ` (${busca ? `${filtradas.length}/` : ""}${notas.length})` : ""}
              </CardTitle>
              <Button
                size="sm"
                disabled={selecionadas.size === 0}
                onClick={() => setVisualizando(true)}
              >
                Visualizar{selecionadas.size > 0 ? ` (${selecionadas.size})` : ""}
              </Button>
            </div>
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
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={todasMarcadas}
                        onChange={toggleTodas}
                        aria-label="Selecionar todas"
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Arquivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((n) => (
                    <TableRow key={n.id} className="hover:bg-accent">
                      <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selecionadas.has(n.id)}
                          onChange={() => toggle(n.id)}
                          aria-label={`Selecionar nota ${n.numero ?? n.id}`}
                        />
                      </TableCell>
                      <TableCell
                        className="cursor-pointer font-mono-num text-muted-foreground"
                        onClick={() => navigate(`/notas/${n.id}`)}
                      >
                        {dataBR(n.data_emissao)}
                      </TableCell>
                      <TableCell className="cursor-pointer" onClick={() => navigate(`/notas/${n.id}`)}>
                        {n.numero ?? "—"}
                      </TableCell>
                      <TableCell className="cursor-pointer font-medium" onClick={() => navigate(`/notas/${n.id}`)}>
                        {n.fornecedor ?? "—"}
                      </TableCell>
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
      ) : (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="gap-3">
            <CardTitle className="text-base font-semibold">
              Busca de itens{itensQuery.isSuccess ? ` (${itensEncontrados.length})` : ""}
            </CardTitle>
            <Input
              value={buscaItem}
              onChange={(e) => setBuscaItem(e.target.value)}
              placeholder="Buscar item por descrição ou código (cProd)…"
              className="max-w-md"
            />
          </CardHeader>
          <CardContent>
            {buscaItem.trim().length < 2 ? (
              <p className="text-sm text-muted-foreground">Digite ao menos 2 caracteres para buscar.</p>
            ) : itensQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Buscando…</p>
            ) : itensQuery.isError ? (
              <p className="text-sm text-destructive">Falha na busca: {errMsg(itensQuery.error)}</p>
            ) : itensEncontrados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                    <TableHead>cProd</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Unid.</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Custo unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensEncontrados.map((i) => (
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
                      <TableCell className="text-xs">{i.fornecedor ?? "—"}</TableCell>
                      <TableCell
                        className="cursor-pointer text-xs text-primary underline-offset-2 hover:underline"
                        onClick={() => navigate(`/notas/${i.nota_id}`)}
                      >
                        {i.nota_numero ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono-num text-xs text-muted-foreground">
                        {dataBR(i.data_emissao)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
