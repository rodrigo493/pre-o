import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { updateProdutoMestre } from "@/repositories/produtosMestreRepo";
import {
  listComponentesDoMontado,
  upsertComponente,
  removeComponente,
  updateQuantidade,
  clearComponentes,
  insertComponentes,
} from "@/repositories/componentesMontadoRepo";
import { parseComposicaoFile, agregarPorCodigo } from "@/lib/composicaoParser";
import { useProdutosResolvidos } from "@/hooks/useProdutosResolvidos";
import { getConfig } from "@/repositories/configRepo";
import { calculateSellingPrice, formatCurrency } from "@/lib/pricing";
import type { Database } from "@/integrations/supabase/types";

export type ProdutoMontadoRow = Database["public"]["Tables"]["produtos_mestre"]["Row"];

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "erro desconhecido";
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed.replace(",", "."));
  return Number.isFinite(num) ? num : NaN;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface EditarMontadoDialogProps {
  produto: ProdutoMontadoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditarMontadoDialog({
  produto,
  open,
  onOpenChange,
}: EditarMontadoDialogProps) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [preco, setPreco] = useState("");
  const [somaNota, setSomaNota] = useState(false);
  const [tempoCorte, setTempoCorte] = useState("");
  const [busy, setBusy] = useState(false);
  const [importando, setImportando] = useState(false);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const produtosQuery = useProdutosResolvidos();
  const configQuery = useQuery({ queryKey: ["config"], queryFn: getConfig });
  const compQuery = useQuery({
    queryKey: ["componentes", produto?.id],
    queryFn: () => listComponentesDoMontado(produto!.id),
    enabled: open && !!produto,
  });

  useEffect(() => {
    setNome(produto?.nome ?? "");
    setCodigo(produto?.codigo ?? "");
    setCategoria(produto?.categoria ?? "");
    setPreco(produto?.preco_manual != null ? String(produto.preco_manual) : "");
    setSomaNota(produto?.soma_nota ?? false);
    setTempoCorte(produto?.tempo_corte_min != null ? String(produto.tempo_corte_min) : "");
    setQuery("");
  }, [produto]);

  const linhas = produtosQuery.data ?? [];
  const custoPorId = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const l of linhas) m.set(l.id, l.resolvido.custoBase);
    return m;
  }, [linhas]);
  const infoPorId = useMemo(() => {
    const m = new Map<string, { nome: string; codigo: string | null }>();
    for (const l of linhas) m.set(l.id, { nome: l.nome, codigo: l.codigo });
    return m;
  }, [linhas]);

  const componentes = compQuery.data ?? [];
  const jaAdicionados = new Set(componentes.map((c) => c.componente_id));

  const resultados = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return linhas
      .filter(
        (l) =>
          l.id !== produto?.id &&
          !jaAdicionados.has(l.id) &&
          normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q),
      )
      .slice(0, 8);
  }, [linhas, query, produto, componentes]);

  const custoTotal = useMemo(
    () =>
      componentes.reduce(
        (s, c) => s + (custoPorId.get(c.componente_id) ?? 0) * Number(c.quantidade),
        0,
      ),
    [componentes, custoPorId],
  );

  const linhaAtual = useMemo(
    () => linhas.find((l) => l.id === produto?.id) ?? null,
    [linhas, produto],
  );
  const custoNotaProprio = linhaAtual?.custoNotaProprio ?? null;
  const maoDeObra = somaNota ? custoNotaProprio ?? 0 : 0;
  const maoDeObraPendente = somaNota && custoNotaProprio == null;
  const tempoNum = parseNumber(tempoCorte);
  const corteLaser =
    tempoNum != null && !Number.isNaN(tempoNum) && tempoNum > 0 && configQuery.data
      ? (tempoNum / 60) * configQuery.data.valorHoraLaser
      : 0;
  const custoComExtras = custoTotal + maoDeObra + corteLaser;

  const precoCalculado = useMemo(() => {
    if (!configQuery.data || custoComExtras <= 0) return null;
    return calculateSellingPrice(custoComExtras, configQuery.data, 0).precoComIPI;
  }, [configQuery.data, custoComExtras]);

  const codigoParaId = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (l.codigo) m.set(l.codigo.trim().toUpperCase(), l.id);
    return m;
  }, [linhas]);

  if (!produto) return null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["componentes", produto.id] });
    queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
    queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
  };

  const adicionar = async (componenteId: string) => {
    setBusy(true);
    try {
      await upsertComponente(produto.id, componenteId, 1);
      setQuery("");
      invalidate();
    } catch (err) {
      toast.error(`Falha ao adicionar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const mudarQtd = async (id: string, valor: string) => {
    const qtd = parseNumber(valor);
    if (qtd == null || Number.isNaN(qtd) || qtd <= 0) return;
    try {
      await updateQuantidade(id, qtd);
      invalidate();
    } catch (err) {
      toast.error(`Falha ao atualizar quantidade: ${errMsg(err)}`);
    }
  };

  const excluir = async (id: string) => {
    try {
      await removeComponente(id);
      invalidate();
    } catch (err) {
      toast.error(`Falha ao remover: ${errMsg(err)}`);
    }
  };

  const importarComposicao = async (file: File) => {
    setImportando(true);
    try {
      const result = await parseComposicaoFile(file);
      const itens = agregarPorCodigo(result.itens).filter(
        (i) => codigoParaId.get(i.codigo.trim().toUpperCase()) !== produto.id, // evita auto-referência
      );
      if (itens.length === 0) {
        toast.warning("Nenhum componente reconhecido no PDF da ficha técnica.");
        return;
      }
      const encontrados: Array<{ componenteId: string; quantidade: number }> = [];
      const naoEncontrados: string[] = [];
      for (const it of itens) {
        const id = codigoParaId.get(it.codigo.trim().toUpperCase());
        if (id) encontrados.push({ componenteId: id, quantidade: it.quantidade });
        else naoEncontrados.push(it.codigo);
      }

      const ok = window.confirm(
        `Importar composição: ${encontrados.length} componente(s) encontrados no catálogo` +
          (naoEncontrados.length ? `, ${naoEncontrados.length} não encontrados (serão ignorados)` : "") +
          `.\n\nIsto SUBSTITUI a composição atual deste montado. Continuar?`,
      );
      if (!ok) return;

      await clearComponentes(produto.id);
      if (encontrados.length > 0) await insertComponentes(produto.id, encontrados);
      invalidate();

      if (naoEncontrados.length > 0) {
        // eslint-disable-next-line no-console
        console.warn("[composição] códigos não encontrados no catálogo:", naoEncontrados);
        toast.warning(
          `${encontrados.length} importados. ${naoEncontrados.length} não estão no catálogo (veja Console F12). Importe o catálogo Nomus desses itens e refaça.`,
        );
      } else {
        toast.success(`Composição importada: ${encontrados.length} componentes.`);
      }
    } catch (err) {
      toast.error(`Falha ao importar composição: ${errMsg(err)}`);
    } finally {
      setImportando(false);
    }
  };

  const salvarDados = async () => {
    const nomeLimpo = nome.trim();
    if (nomeLimpo === "") {
      toast.error("Informe o nome do produto.");
      return;
    }
    const precoNum = parseNumber(preco);
    if (precoNum != null && (Number.isNaN(precoNum) || precoNum < 0)) {
      toast.error("Preço manual inválido.");
      return;
    }
    const tempoSalvar = parseNumber(tempoCorte);
    if (tempoSalvar != null && (Number.isNaN(tempoSalvar) || tempoSalvar < 0)) {
      toast.error("Tempo de corte inválido.");
      return;
    }
    setBusy(true);
    try {
      await updateProdutoMestre(produto.id, {
        nome: nomeLimpo,
        codigo: codigo.trim() === "" ? null : codigo.trim(),
        categoria: categoria.trim() === "" ? null : categoria.trim(),
        preco_manual: precoNum, // null = usa o preço calculado pela composição
        soma_nota: somaNota,
        tempo_corte_min: tempoSalvar,
      });
      invalidate();
      toast.success("Produto montado salvo.");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Composição — {produto.nome}</DialogTitle>
          <DialogDescription>
            Monte o produto a partir de produtos Nomus. O custo de cada componente vem
            automaticamente do maior custo dos últimos 3 meses; o preço sai do markup sobre o total.
          </DialogDescription>
        </DialogHeader>

        {/* Dados */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-nome">Nome</Label>
            <Input id="m-nome" value={nome} onChange={(e) => setNome(e.target.value)} disabled={busy} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-codigo">Código</Label>
            <Input id="m-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={busy} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-categoria">Categoria/Grupo</Label>
            <Input
              id="m-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        {/* Composição */}
        <div className="mt-2 flex flex-col gap-3 border-t pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Componentes</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importarComposicao(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={importando || busy}
              onClick={() => fileRef.current?.click()}
            >
              {importando ? "Importando…" : "Importar composição (PDF)"}
            </Button>
          </div>

          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar produto Nomus para adicionar (código ou nome)…"
              disabled={busy}
            />
            {query.trim() && resultados.length > 0 && (
              <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-white p-1 shadow-lg">
                {resultados.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => void adicionar(l.id)}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{l.nome}</span>
                      <span className="font-mono-num text-[11px] text-muted-foreground">
                        {l.codigo ?? "—"} · {formatCurrency(l.resolvido.custoBase ?? 0)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {componentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum componente. Busque um produto acima para adicionar.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left">Componente</th>
                    <th className="px-3 py-2 text-right">Custo un.</th>
                    <th className="px-3 py-2 text-center">Qtd</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {componentes.map((c) => {
                    const info = infoPorId.get(c.componente_id);
                    const custoUn = custoPorId.get(c.componente_id) ?? 0;
                    const subtotal = custoUn * Number(c.quantidade);
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-medium">{info?.nome ?? "—"}</span>
                          <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                            {info?.codigo ?? ""}
                          </span>
                          {custoUn === 0 && (
                            <span className="ml-2 text-[11px] text-amber-600">sem custo</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-num text-muted-foreground">
                          {formatCurrency(custoUn)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={String(Number(c.quantidade))}
                            onBlur={(e) => void mudarQtd(c.id, e.target.value)}
                            className="mx-auto h-8 w-20 text-center"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono-num">
                          {formatCurrency(subtotal)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => void excluir(c.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col items-end gap-1 rounded-lg bg-muted/40 p-3">
            <div className="flex w-full justify-between text-sm">
              <span className="text-muted-foreground">Componentes</span>
              <span className="font-mono-num">{formatCurrency(custoTotal)}</span>
            </div>
            {somaNota && (
              <div className="flex w-full justify-between text-sm">
                <span className="text-muted-foreground">
                  Mão de obra (nota)
                  {maoDeObraPendente && (
                    <span className="ml-2 text-[11px] text-amber-600">
                      sem nota deste código nos últimos 3 meses
                    </span>
                  )}
                </span>
                <span className="font-mono-num">{formatCurrency(maoDeObra)}</span>
              </div>
            )}
            {corteLaser > 0 && (
              <div className="flex w-full justify-between text-sm">
                <span className="text-muted-foreground">Corte laser</span>
                <span className="font-mono-num">{formatCurrency(corteLaser)}</span>
              </div>
            )}
            <div className="flex w-full justify-between border-t pt-1 text-sm">
              <span className="text-muted-foreground">Custo total</span>
              <span className="font-mono-num font-medium">{formatCurrency(custoComExtras)}</span>
            </div>
            <div className="flex w-full justify-between text-sm">
              <span className="text-muted-foreground">Preço de venda (markup)</span>
              <span className="font-mono-num font-semibold text-foreground">
                {precoCalculado != null ? formatCurrency(precoCalculado) : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Serviço (US / corte laser) */}
        <div className="mt-2 flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">Serviço (peça fabricada)</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={somaNota}
              onChange={(e) => setSomaNota(e.target.checked)}
              disabled={busy}
            />
            <span>
              Somar mão de obra da nota
              <span className="block text-xs text-muted-foreground">
                Usa o maior preço da nota deste código nos últimos 3 meses (ex.: torneiro dos US).
              </span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="m-tempo-corte">Tempo de corte laser (min)</Label>
            <Input
              id="m-tempo-corte"
              type="number"
              min="0"
              step="0.1"
              value={tempoCorte}
              onChange={(e) => setTempoCorte(e.target.value)}
              placeholder="vazio = não corta no laser"
              disabled={busy}
            />
            <span className="text-xs text-muted-foreground">
              Custo = tempo ÷ 60 × valor da hora do laser (em Configurações).
            </span>
          </div>
        </div>

        {/* Preço manual opcional */}
        <div className="mt-2 flex flex-col gap-1.5 border-t pt-4">
          <Label htmlFor="m-preco">Preço de venda manual (opcional)</Label>
          <Input
            id="m-preco"
            type="number"
            min="0"
            step="0.01"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            placeholder="vazio = usar o preço calculado pela composição"
            disabled={busy}
          />
          <span className="text-xs text-muted-foreground">
            Se preencher, trava esse preço. Deixe vazio para usar o cálculo automático acima.
          </span>
        </div>

        <DialogFooter>
          <Button onClick={() => void salvarDados()} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
