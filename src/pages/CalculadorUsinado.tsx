import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useProdutosResolvidos, type LinhaProduto } from "@/hooks/useProdutosResolvidos";
import {
  listConfigBitolas,
  addBitola,
  updateBitola,
  deleteBitola,
  getPecaUsinado,
  upsertPecaUsinado,
} from "@/repositories/bitolasRepo";
import { calcularCustoPecaUsinada } from "@/lib/usinadoCost";
import { acharProdutoDaBitola, type BitolaLike } from "@/lib/bitolaMatch";
import { rkgCru } from "@/lib/rkgCru";
import { formatCurrency } from "@/lib/pricing";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}
function parseNum(v: string): number {
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalize(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
/** R$/kg recuperado do produto (desfaz fator × se houver). Para R$/un, é o custoBase. */
function rkgDe(prod: LinhaProduto | undefined): number {
  return rkgCru(prod?.resolvido.custoBase ?? 0, prod?.fatorConversao ?? null, prod?.conversaoOp ?? null);
}

export default function CalculadorUsinado({ pecaIdInicial }: { pecaIdInicial?: string } = {}) {
  const queryClient = useQueryClient();
  const produtosQuery = useProdutosResolvidos();
  const bitolasQuery = useQuery({ queryKey: ["config-bitolas"], queryFn: listConfigBitolas });
  const linhas = produtosQuery.data ?? [];
  const bitolas = bitolasQuery.data ?? [];
  const prodPorId = useMemo(() => new Map(linhas.map((l) => [l.id, l])), [linhas]);

  const [pecaId, setPecaId] = useState<string | null>(pecaIdInicial ?? null);
  const [busca, setBusca] = useState("");
  const [trefId, setTrefId] = useState("");
  const [plastId, setPlastId] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [maoDeObra, setMaoDeObra] = useState("");
  const [busy, setBusy] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);

  const peca = linhas.find((l) => l.id === pecaId) ?? null;
  const trefiladas = bitolas.filter((b) => b.tipo === "trefilado");
  const plasticas = bitolas.filter((b) => b.tipo === "plastico");

  useEffect(() => {
    if (!pecaId) return;
    void (async () => {
      const spec = await getPecaUsinado(pecaId);
      if (spec) {
        setTrefId(spec.bitola_trefilado_id ?? "");
        setPlastId(spec.bitola_plastico_id ?? "");
        setComprimento(String(Number(spec.comprimento_mm)));
        setMaoDeObra(String(Number(spec.mao_de_obra)));
      } else {
        setTrefId(""); setPlastId(""); setComprimento(""); setMaoDeObra("");
      }
    })();
  }, [pecaId]);

  const resultados = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return [];
    return linhas.filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q)).slice(0, 40);
  }, [linhas, busca]);

  const tref = trefiladas.find((b) => b.id === trefId) ?? null;
  const plast = plasticas.find((b) => b.id === plastId) ?? null;
  const prodDaBitola = (b: BitolaLike | null) => {
    if (!b) return undefined;
    const id = acharProdutoDaBitola(b, linhas);
    return id ? prodPorId.get(id) : undefined;
  };

  const calc = useMemo(() => {
    return calcularCustoPecaUsinada({
      comprimentoMm: parseNum(comprimento),
      maoDeObra: parseNum(maoDeObra),
      trefilado: tref
        ? {
            rkg: rkgDe(prodDaBitola(tref)),
            pesoBarraKg: Number(tref.peso_barra_kg ?? 0),
            comprimentoBarraMm: Number(tref.comprimento_barra_mm),
          }
        : null,
      plastico: plast
        ? {
            valorBarra: prodDaBitola(plast)?.resolvido.custoBase ?? 0,
            comprimentoBarraMm: Number(plast.comprimento_barra_mm),
          }
        : null,
    });
  }, [comprimento, maoDeObra, tref, plast, linhas]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    if (!pecaId) { toast.error("Selecione a peça."); return; }
    if (parseNum(comprimento) <= 0 && !plast && !tref) {
      toast.error("Informe comprimento e ao menos uma bitola."); return;
    }
    setBusy(true);
    try {
      await upsertPecaUsinado({
        produto_mestre_id: pecaId,
        bitola_trefilado_id: trefId || null,
        bitola_plastico_id: plastId || null,
        comprimento_mm: parseNum(comprimento),
        mao_de_obra: parseNum(maoDeObra),
      });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success("Custo da peça usinada salvo.");
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Custo de peça usinada: <strong>trefilado</strong> (R$/kg × peso da barra, rateado pelo
        comprimento) + <strong>plástico</strong> (R$/un da barra, rateado) + <strong>mão de obra</strong>.
      </p>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Peça e medidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative flex flex-col gap-1.5">
            <Label>Peça</Label>
            {peca ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{peca.nome}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{peca.codigo ?? ""}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => { setPecaId(null); setBusca(""); }}>Trocar</Button>
              </div>
            ) : (
              <>
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar peça usinada (código ou nome)…" />
                {busca.trim() && resultados.length > 0 && (
                  <ul className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg">
                    {resultados.map((l) => (
                      <li key={l.id}>
                        <button type="button" onClick={() => { setPecaId(l.id); setBusca(""); }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">{l.codigo ?? "—"}</span>
                          <span className="truncate font-medium">{l.nome}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Bitola do trefilado</Label>
              <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={trefId} onChange={(e) => setTrefId(e.target.value)}>
                <option value="">— nenhum</option>
                {trefiladas.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Bitola do plástico</Label>
              <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={plastId} onChange={(e) => setPlastId(e.target.value)}>
                <option value="">— nenhum</option>
                {plasticas.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Comprimento (mm)</Label>
              <Input type="number" min="0" step="0.01" value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Mão de obra da usinagem (R$)</Label>
              <Input type="number" min="0" step="0.01" value={maoDeObra} onChange={(e) => setMaoDeObra(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader><CardTitle className="text-base font-semibold">Custo da peça</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Row label="Material trefilado" value={formatCurrency(calc.custoTrefilado)} />
          <Row label="Material plástico" value={formatCurrency(calc.custoPlastico)} />
          <Row label="Mão de obra" value={formatCurrency(parseNum(maoDeObra))} />
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Custo unitário</span>
            <span className="font-mono-num">{formatCurrency(calc.custoUnitario)}</span>
          </div>
          <div className="mt-2">
            <Button onClick={() => void salvar()} disabled={busy || !pecaId}>
              {busy ? "Salvando…" : "Salvar custo na peça"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfigBitolas
        bitolas={bitolas}
        linhas={linhas}
        prodPorId={prodPorId}
        aberto={mostrarConfig}
        onToggle={() => setMostrarConfig((v) => !v)}
        onChange={() => queryClient.invalidateQueries({ queryKey: ["config-bitolas"] })}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-num">{value}</span>
    </div>
  );
}

interface ConfigBitolasProps {
  bitolas: Array<{ id: string; tipo: "trefilado" | "plastico"; nome: string; produto_mestre_id: string | null; comprimento_barra_mm: number; peso_barra_kg: number | null }>;
  linhas: LinhaProduto[];
  prodPorId: Map<string, LinhaProduto>;
  aberto: boolean;
  onToggle: () => void;
  onChange: () => void;
}

function ConfigBitolas({ bitolas, linhas, prodPorId, aberto, onToggle, onChange }: ConfigBitolasProps) {
  const [tipo, setTipo] = useState<"trefilado" | "plastico">("trefilado");
  const [nome, setNome] = useState("");
  const [busca, setBusca] = useState("");
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [comprBarra, setComprBarra] = useState("6000");
  const [peso, setPeso] = useState("");
  const [busy, setBusy] = useState(false);
  const [buscasItem, setBuscasItem] = useState<Record<string, string>>({});

  const apontar = async (id: string, pid: string | null) => {
    try {
      await updateBitola(id, { produto_mestre_id: pid });
      setBuscasItem((p) => ({ ...p, [id]: "" }));
      onChange();
      toast.success("Produto da bitola atualizado.");
    } catch (err) {
      toast.error(`Falha: ${errMsg(err)}`);
    }
  };

  const res = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return [];
    return linhas.filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q)).slice(0, 6);
  }, [linhas, busca]);
  const prodSel = produtoId ? prodPorId.get(produtoId) : null;

  const adicionar = async () => {
    if (nome.trim() === "") { toast.error("Informe o nome da bitola."); return; }
    if (!produtoId) { toast.error("Escolha o produto do catálogo."); return; }
    if (parseNum(comprBarra) <= 0) { toast.error("Comprimento da barra inválido."); return; }
    if (tipo === "trefilado" && parseNum(peso) <= 0) { toast.error("Informe o peso da barra (trefilado)."); return; }
    setBusy(true);
    try {
      await addBitola({
        tipo,
        nome: nome.trim(),
        produto_mestre_id: produtoId,
        comprimento_barra_mm: parseNum(comprBarra),
        peso_barra_kg: tipo === "trefilado" ? parseNum(peso) : null,
      });
      setNome(""); setBusca(""); setProdutoId(null); setPeso("");
      onChange();
      toast.success("Bitola cadastrada.");
    } catch (err) {
      toast.error(`Falha ao cadastrar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const remover = async (id: string) => {
    try { await deleteBitola(id); onChange(); toast.success("Bitola removida."); }
    catch (err) { toast.error(`Falha ao remover: ${errMsg(err)}`); }
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Configurar bitolas</CardTitle>
          <Button variant="ghost" size="sm" onClick={onToggle}>{aberto ? "Ocultar" : "Abrir"}</Button>
        </div>
        {aberto && (
          <p className="text-xs text-muted-foreground">
            Cadastre as bitolas (trefilado em R$/kg + peso da barra; plástico em R$/un da barra).
            Aponte o produto do catálogo que tem o custo da nota.
          </p>
        )}
      </CardHeader>
      {aberto && (
        <CardContent className="flex flex-col gap-4">
          {/* Form de cadastro */}
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Tipo</Label>
              <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as "trefilado" | "plastico")}>
                <option value="trefilado">Trefilado (R$/kg, barra 6m)</option>
                <option value="plastico">Plástico (R$/un, barra 1m)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Bitola (nome)</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder='ex.: 3/16"' className="h-9" />
            </div>
            <div className="relative flex flex-col gap-1 sm:col-span-2">
              <Label className="text-xs">Produto do catálogo (custo)</Label>
              {prodSel ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                  <span>{prodSel.codigo ? `${prodSel.codigo} · ` : ""}{prodSel.nome}{prodSel.resolvido.custoBase ? ` — ${formatCurrency(prodSel.resolvido.custoBase)}` : " — sem custo"}</span>
                  <Button variant="ghost" size="sm" onClick={() => { setProdutoId(null); setBusca(""); }}>Trocar</Button>
                </div>
              ) : (
                <>
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto (código ou nome)…" className="h-9" />
                  {busca.trim() && res.length > 0 && (
                    <ul className="absolute top-full z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg">
                      {res.map((l) => (
                        <li key={l.id}>
                          <button type="button" onClick={() => { setProdutoId(l.id); setBusca(""); }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent">
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{l.codigo ?? "—"}</span>
                            <span className="truncate">{l.nome}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Comprimento da barra (mm)</Label>
              <Input value={comprBarra} onChange={(e) => setComprBarra(e.target.value)} inputMode="decimal" className="h-9" />
            </div>
            {tipo === "trefilado" && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Peso da barra (kg)</Label>
                <Input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="ex.: 9" className="h-9" />
              </div>
            )}
            <div className="sm:col-span-2">
              <Button size="sm" onClick={() => void adicionar()} disabled={busy}>
                {busy ? "Salvando…" : "Adicionar bitola"}
              </Button>
            </div>
          </div>

          {/* Lista com seletor de produto por bitola */}
          {bitolas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma bitola cadastrada.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {bitolas.map((b) => {
                const pid = acharProdutoDaBitola(b, linhas);
                const p = pid ? prodPorId.get(pid) : null;
                // Trefilado: valor da barra = R$/kg × peso. Plástico: R$/un (barra 1m) direto.
                const custoUn =
                  p?.resolvido.custoBase != null
                    ? b.tipo === "trefilado"
                      ? rkgDe(p) * Number(b.peso_barra_kg ?? 0)
                      : p.resolvido.custoBase
                    : null;
                const rotuloUn = b.tipo === "trefilado" ? "/barra" : "/un";
                const q = normalize((buscasItem[b.id] ?? "").trim());
                const res = q ? linhas.filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q)).slice(0, 6) : [];
                return (
                  <div key={b.id} className="flex flex-col gap-1 border-b pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <span className="font-medium">{b.nome}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          ({b.tipo}, barra {Number(b.comprimento_barra_mm)}mm
                          {b.peso_barra_kg != null ? `, ${Number(b.peso_barra_kg)}kg` : ""})
                          {" — "}{p ? `${p.codigo ? `${p.codigo} · ` : ""}${custoUn && custoUn > 0 ? formatCurrency(custoUn) + rotuloUn : "sem custo"}` : "sem produto"}
                        </span>
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => void remover(b.id)}>Remover</Button>
                    </div>
                    <div className="relative">
                      <Input value={buscasItem[b.id] ?? ""} onChange={(e) => setBuscasItem((pp) => ({ ...pp, [b.id]: e.target.value }))}
                        placeholder="Apontar produto da nota (código ou nome)…" className="h-8 text-xs" />
                      {q && res.length > 0 && (
                        <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg">
                          {res.map((l) => (
                            <li key={l.id}>
                              <button type="button" onClick={() => void apontar(b.id, l.id)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent">
                                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{l.codigo ?? "—"}</span>
                                <span className="truncate">{l.nome}</span>
                                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{l.resolvido.custoBase ? formatCurrency(l.resolvido.custoBase) : "—"}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
