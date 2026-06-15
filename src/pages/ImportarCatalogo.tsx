import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ImportDropzone from "@/components/ImportDropzone";
import {
  parseCatalogFileWithDiag,
  parseCatalogSheetFileWithDiag,
  dedupeCatalog,
  type CatalogProduct,
} from "@/lib/catalogParser";
import { listProdutosMestre, upsertCatalogByCodigo } from "@/repositories/produtosMestreRepo";

interface FileReport {
  nome: string;
  paginas: number;
  porPagina: number[];
  total: number;
  anchorsAchados: boolean;
  erro?: string;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
  }
  return "erro desconhecido";
}

export default function ImportarCatalogo() {
  const queryClient = useQueryClient();
  const [produtos, setProdutos] = useState<CatalogProduct[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ atual: 0, total: 0 });
  const [relatorio, setRelatorio] = useState<FileReport[]>([]);

  // Códigos já existentes para mostrar "novos vs atualizam".
  const mestresQuery = useQuery({ queryKey: ["produtos-mestre"], queryFn: listProdutosMestre });
  const codigosExistentes = useMemo(
    () => new Set((mestresQuery.data ?? []).map((m) => m.codigo).filter(Boolean) as string[]),
    [mestresQuery.data],
  );

  const handleFiles = async (files: File[]) => {
    const aceitos = files.filter((f) => /\.(pdf|csv|xls|xlsx)$/i.test(f.name));
    if (aceitos.length === 0) {
      toast.warning("Solte os PDFs, CSV ou Excel do catálogo Nomus.");
      return;
    }
    setParsing(true);
    setProgress({ atual: 0, total: aceitos.length });
    const todos: CatalogProduct[] = [];
    const reports: FileReport[] = [];
    let i = 0;
    for (const file of aceitos) {
      i += 1;
      setProgress({ atual: i, total: aceitos.length });
      try {
        const ehPlanilha = /\.(csv|xls|xlsx)$/i.test(file.name);
        const diag = ehPlanilha
          ? await parseCatalogSheetFileWithDiag(file)
          : await parseCatalogFileWithDiag(file);
        todos.push(...diag.produtos);
        reports.push({
          nome: file.name,
          paginas: diag.paginas,
          porPagina: diag.porPagina,
          total: diag.produtos.length,
          anchorsAchados: diag.anchorsAchados,
        });
        // Dump no console p/ diagnóstico fino quando algo não vier completo.
        if (diag.produtos.length === 0 || !diag.anchorsAchados) {
          // eslint-disable-next-line no-console
          console.warn(`[catalogo] ${file.name}`, diag.debug);
        }
        // Avisos claros por arquivo.
        if (!diag.anchorsAchados) {
          toast.error(`${file.name}: colunas não reconhecidas — 0 produtos lidos.`);
        } else {
          const pagsVazias = diag.porPagina
            .map((n, idx) => ({ n, idx }))
            .filter((p) => p.n === 0);
          if (pagsVazias.length > 0) {
            toast.warning(
              `${file.name}: ${diag.produtos.length} produtos, mas página(s) ${pagsVazias
                .map((p) => p.idx + 1)
                .join(", ")} ficaram vazias — confira.`,
            );
          }
        }
      } catch (err) {
        reports.push({
          nome: file.name,
          paginas: 0,
          porPagina: [],
          total: 0,
          anchorsAchados: false,
          erro: errMsg(err),
        });
        toast.error(`Falha ao ler ${file.name}: ${errMsg(err)}`);
      }
    }
    setRelatorio(reports);
    if (todos.length > 0) {
      setProdutos((prev) => dedupeCatalog([...prev, ...todos]));
      toast.success(`${todos.length} produto(s) lido(s) em ${aceitos.length} arquivo(s).`);
    } else {
      toast.warning("Nenhum produto reconhecido nos arquivos.");
    }
    setParsing(false);
  };

  const novos = produtos.filter((p) => !codigosExistentes.has(p.codigo)).length;
  const atualizam = produtos.length - novos;

  const handleSalvar = async () => {
    if (produtos.length === 0) return;
    setSaving(true);
    try {
      const n = await upsertCatalogByCodigo(
        produtos.map((p) => ({
          codigo: p.codigo,
          nome: p.nome,
          unidade: p.unidade,
          unidade_secundaria: p.unidadeSecundaria,
          tipo: p.tipo,
          categoria: p.categoria,
        })),
      );
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success(`${n} produto(s) salvos no catálogo.`);
      setProdutos([]);
    } catch (err) {
      toast.error(`Falha ao salvar catálogo: ${errMsg(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const amostra = produtos.slice(0, 50);

  // Navegador do catálogo: todos os produtos salvos, agrupados por grupo, com busca.
  const todosMestres = mestresQuery.data ?? [];
  const [catBusca, setCatBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const catQ = normalize(catBusca.trim());
  const catFiltrados = catQ
    ? todosMestres.filter((m) => normalize(`${m.codigo ?? ""} ${m.nome} ${m.categoria ?? ""}`).includes(catQ))
    : todosMestres;
  const porGrupo = useMemo(() => {
    const map = new Map<string, typeof todosMestres>();
    for (const m of catFiltrados) {
      const g = m.categoria ?? "— sem grupo —";
      const arr = map.get(g) ?? [];
      arr.push(m);
      map.set(g, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [catFiltrados]);
  const toggleGrupo = (g: string) =>
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar catálogo Nomus</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Solte o relatório “Produtos” do Nomus em <strong>PDF, CSV ou Excel</strong> (CSV/Excel é
          mais confiável). O sistema cria/atualiza os produtos (código, descrição, unidade, tipo e
          grupo). Defina o fator de conversão por produto depois, quando a nota vier em unidade
          diferente.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="pt-6">
          <ImportDropzone
            onFiles={handleFiles}
            accept={[".pdf", ".csv", ".xls", ".xlsx"]}
            disabled={parsing || saving}
            hint={
              <>
                Arraste o <strong>catálogo Nomus</strong> aqui — PDF, CSV ou Excel (pode soltar
                vários)
              </>
            }
          />
          {parsing && (
            <p className="mt-3 text-sm text-muted-foreground">
              Lendo PDFs… {progress.total > 0 ? `${progress.atual}/${progress.total}` : ""}
            </p>
          )}
          {relatorio.length > 0 && (
            <div className="mt-4 space-y-1.5 text-xs">
              {relatorio.map((r) => {
                const ok = r.anchorsAchados && !r.erro && r.porPagina.every((n) => n > 0);
                return (
                  <div key={r.nome} className="flex items-center gap-2">
                    <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "✓" : "⚠"}</span>
                    <span className="font-medium">{r.nome}</span>
                    <span className="text-muted-foreground">
                      {r.erro
                        ? `erro: ${r.erro}`
                        : !r.anchorsAchados
                          ? "cabeçalho não reconhecido — 0 produtos"
                          : `${r.total} produtos · ${r.paginas} pág. · por página: [${r.porPagina.join(", ")}]`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {produtos.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold">
              {produtos.length} produto(s) · {novos} novo(s) · {atualizam} atualizam
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setProdutos([])} disabled={saving}>
                Limpar
              </Button>
              <Button onClick={handleSalvar} disabled={saving}>
                {saving ? "Salvando…" : "Salvar catálogo"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Amostra dos primeiros {amostra.length} (de {produtos.length}) para conferência.
            </p>
            <Table>
              <TableHeader>
                <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>U.M.</TableHead>
                  <TableHead>U.M. sec.</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {amostra.map((p) => (
                  <TableRow key={p.codigo}>
                    <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                    <TableCell className="max-w-[26rem]">
                      <span className="line-clamp-2">{p.nome}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.categoria ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.unidade ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.unidadeSecundaria ?? "—"}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.tipo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {codigosExistentes.has(p.codigo) ? "atualiza" : "novo"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Catálogo salvo: todos os produtos, por grupo */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="gap-3">
          <CardTitle className="text-base font-semibold">
            Catálogo{!mestresQuery.isLoading ? ` (${todosMestres.length} produtos · ${porGrupo.length} grupos)` : ""}
          </CardTitle>
          <Input
            value={catBusca}
            onChange={(e) => setCatBusca(e.target.value)}
            placeholder="Buscar no catálogo por código, descrição ou grupo…"
            className="max-w-md"
          />
        </CardHeader>
        <CardContent>
          {mestresQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : porGrupo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {porGrupo.map(([grupo, itens]) => {
                const aberto = abertos.has(grupo) || catQ.length > 0;
                return (
                  <div key={grupo} className="overflow-hidden rounded-lg border">
                    <button
                      type="button"
                      onClick={() => toggleGrupo(grupo)}
                      className="flex w-full items-center justify-between bg-muted/40 px-3 py-2 text-left text-sm font-medium hover:bg-muted/60"
                    >
                      <span>{grupo}</span>
                      <span className="text-xs text-muted-foreground">{itens.length} {aberto ? "▲" : "▼"}</span>
                    </button>
                    {aberto && (
                      <table className="w-full text-sm">
                        <tbody>
                          {itens
                            .slice()
                            .sort((a, b) => (a.codigo ?? "").localeCompare(b.codigo ?? "", "pt-BR"))
                            .map((m) => (
                              <tr key={m.id} className="border-t">
                                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground w-48">{m.codigo ?? "—"}</td>
                                <td className="px-3 py-1.5">{m.nome}</td>
                                <td className="px-3 py-1.5 text-right text-xs uppercase text-muted-foreground">{m.tipo}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
