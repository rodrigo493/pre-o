// src/components/ImportarFichaDialog.tsx
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseComposicaoFile,
  agregarPorCodigo,
  type ComposicaoItem,
} from "@/lib/composicaoParser";
import { separarComposicao } from "@/lib/composicaoClassify";
import {
  casarNoCatalogo,
  criarProdutoDaFicha,
  type ComponenteCasado,
} from "@/lib/criarProdutoDaFicha";
import { useProdutosResolvidos } from "@/hooks/useProdutosResolvidos";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

interface FichaPreparada {
  codigo: string;
  nome: string;
  grupo: string;
  encontrados: ComponenteCasado[];
  naoEncontrados: ComposicaoItem[];
  fabricadosCount: number;
}

export default function ImportarFichaDialog() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ficha, setFicha] = useState<FichaPreparada | null>(null);

  const produtosQuery = useProdutosResolvidos();

  const lerFicha = async (file: File) => {
    setLendo(true);
    try {
      const result = await parseComposicaoFile(file);
      const agregados = agregarPorCodigo(result.itens);
      if (agregados.length === 0) {
        toast.warning("Nenhum componente reconhecido no PDF da ficha técnica.");
        return;
      }
      const { materiaPrima, fabricados } = separarComposicao(agregados);
      const catalogo = (produtosQuery.data ?? []).map((l) => ({ id: l.id, codigo: l.codigo ?? null }));
      const { encontrados, naoEncontrados } = casarNoCatalogo(materiaPrima, catalogo);
      setFicha({
        codigo: result.produtoCodigo ?? "",
        nome: result.produtoDescricao ?? "",
        grupo: result.produtoGrupo ?? "",
        encontrados,
        naoEncontrados,
        fabricadosCount: fabricados.length,
      });
      setOpen(true);
    } catch (err) {
      toast.error(`Falha ao ler a ficha técnica: ${errMsg(err)}`);
    } finally {
      setLendo(false);
    }
  };

  const criar = async () => {
    if (!ficha) return;
    if (ficha.codigo.trim() === "") {
      toast.error("Informe o código do produto.");
      return;
    }
    if (ficha.nome.trim() === "") {
      toast.error("Informe o nome do produto.");
      return;
    }
    setSalvando(true);
    try {
      const r = await criarProdutoDaFicha({
        codigo: ficha.codigo.trim(),
        nome: ficha.nome.trim(),
        categoria: ficha.grupo.trim() === "" ? null : ficha.grupo.trim(),
        componentes: ficha.encontrados.map((e) => ({
          componenteId: e.componenteId,
          quantidade: e.quantidade,
        })),
      });
      queryClient.invalidateQueries({ queryKey: ["componentes", r.montadoId] });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      toast.success(
        `Produto "${ficha.nome.trim()}" criado com ${r.vinculados} componente(s). O preço já aparece em Produtos.`,
      );
      setOpen(false);
      setFicha(null);
    } catch (err) {
      toast.error(`Falha ao criar produto: ${errMsg(err)}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lerFicha(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        disabled={lendo || produtosQuery.isLoading}
        onClick={() => fileRef.current?.click()}
      >
        {lendo ? "Lendo ficha…" : "Importar ficha técnica (PDF)"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setFicha(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar produto da ficha técnica</DialogTitle>
            <DialogDescription>
              Confira os dados extraídos do PDF. O custo será a soma das matérias-primas; as
              montagens (EST/MO/MOP/MOF/KIT) são ignoradas para não contar duas vezes.
            </DialogDescription>
          </DialogHeader>

          {ficha && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="f-codigo">Código *</Label>
                  <Input
                    id="f-codigo"
                    value={ficha.codigo}
                    onChange={(e) => setFicha({ ...ficha, codigo: e.target.value })}
                    disabled={salvando}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="f-nome">Nome *</Label>
                  <Input
                    id="f-nome"
                    value={ficha.nome}
                    onChange={(e) => setFicha({ ...ficha, nome: e.target.value })}
                    disabled={salvando}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="f-grupo">Categoria/Grupo</Label>
                  <Input
                    id="f-grupo"
                    value={ficha.grupo}
                    onChange={(e) => setFicha({ ...ficha, grupo: e.target.value })}
                    disabled={salvando}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Matérias-primas encontradas no catálogo
                  </span>
                  <span className="font-medium">{ficha.encontrados.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Não encontradas (ignoradas)</span>
                  <span
                    className={
                      ficha.naoEncontrados.length > 0
                        ? "font-medium text-amber-600"
                        : "font-medium"
                    }
                  >
                    {ficha.naoEncontrados.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montagens ignoradas no custo</span>
                  <span className="font-medium">{ficha.fabricadosCount}</span>
                </div>
              </div>

              {ficha.naoEncontrados.length > 0 && (
                <details className="rounded-lg border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Ver {ficha.naoEncontrados.length} matéria(s)-prima(s) não encontrada(s)
                  </summary>
                  <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto">
                    {ficha.naoEncontrados.map((i) => (
                      <li key={i.codigo} className="flex justify-between gap-2">
                        <span className="font-mono text-xs">{i.codigo}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {i.descricao}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Importe o catálogo Nomus desses itens e reimporte a ficha para incluí-los no
                    custo.
                  </p>
                </details>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void criar()} disabled={salvando || !ficha}>
              {salvando ? "Criando…" : "Criar produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
