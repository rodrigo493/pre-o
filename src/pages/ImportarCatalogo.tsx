import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import ImportDropzone from "@/components/ImportDropzone";
import { parseCatalogFile, dedupeCatalog, type CatalogProduct } from "@/lib/catalogParser";
import { listProdutosMestre, upsertCatalogByCodigo } from "@/repositories/produtosMestreRepo";

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

  // Códigos já existentes para mostrar "novos vs atualizam".
  const mestresQuery = useQuery({ queryKey: ["produtos-mestre"], queryFn: listProdutosMestre });
  const codigosExistentes = useMemo(
    () => new Set((mestresQuery.data ?? []).map((m) => m.codigo).filter(Boolean) as string[]),
    [mestresQuery.data],
  );

  const handleFiles = async (files: File[]) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      toast.warning("Solte os PDFs do catálogo Nomus.");
      return;
    }
    setParsing(true);
    setProgress({ atual: 0, total: pdfs.length });
    const todos: CatalogProduct[] = [];
    let i = 0;
    for (const file of pdfs) {
      i += 1;
      setProgress({ atual: i, total: pdfs.length });
      try {
        const lidos = await parseCatalogFile(file);
        todos.push(...lidos);
      } catch (err) {
        toast.error(`Falha ao ler ${file.name}: ${errMsg(err)}`);
      }
    }
    if (todos.length > 0) {
      setProdutos((prev) => dedupeCatalog([...prev, ...todos]));
      toast.success(`${todos.length} linha(s) lida(s) em ${pdfs.length} PDF(s).`);
    } else {
      toast.warning("Nenhum produto reconhecido nos PDFs.");
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar catálogo Nomus</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Solte os PDFs do relatório “Produtos” do Nomus. O sistema cria/atualiza os produtos
          (código, descrição, unidade e tipo). Defina o fator de conversão por produto depois,
          quando a nota vier em unidade diferente.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="pt-6">
          <ImportDropzone
            onFiles={handleFiles}
            disabled={parsing || saving}
            hint={
              <>
                Arraste os PDFs do <strong>catálogo Nomus</strong> aqui (pode soltar vários)
              </>
            }
          />
          {parsing && (
            <p className="mt-3 text-sm text-muted-foreground">
              Lendo PDFs… {progress.total > 0 ? `${progress.atual}/${progress.total}` : ""}
            </p>
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
    </div>
  );
}
