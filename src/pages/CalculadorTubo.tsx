import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useProdutosResolvidos, type LinhaProduto } from "@/hooks/useProdutosResolvidos";
import { getConfig } from "@/repositories/configRepo";
import {
  listConfigBitolas,
  updateBitola,
  getPecaTubo,
  upsertPecaTubo,
  type ConfigBitola,
} from "@/repositories/bitolasRepo";
import { listComponentesDoMontado } from "@/repositories/componentesMontadoRepo";
import { calcularCustoPecaTubo } from "@/lib/tuboCost";
import { acharProdutoDaBitola } from "@/lib/bitolaMatch";
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
function rkgDe(prod: LinhaProduto | undefined): number {
  const base = prod?.resolvido.custoBase ?? 0;
  const fator = prod?.fatorConversao ?? null;
  return prod?.conversaoOp === "multiplicar" && fator && fator > 0 ? base / fator : base;
}
/** Dimensão da bitola sem o tipo (ex.: "Quadrado 50x30x2" → "50x30x2"). */
function dimDaBitola(nome: string): string {
  return normalize(nome.replace(/^(redondo|quadrado|cantoneira|ferro chato)\s*/i, "")).replace(/\s+/g, "");
}

export default function CalculadorTubo() {
  const queryClient = useQueryClient();
  const produtosQuery = useProdutosResolvidos();
  const bitolasQuery = useQuery({ queryKey: ["config-bitolas"], queryFn: listConfigBitolas });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: getConfig });
  const linhas = produtosQuery.data ?? [];
  const prodPorId = useMemo(() => new Map(linhas.map((l) => [l.id, l])), [linhas]);
  const tubos = (bitolasQuery.data ?? []).filter((b) => b.tipo === "tubo");

  const [pecaId, setPecaId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [bitolaId, setBitolaId] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [tempo, setTempo] = useState("");
  const [busy, setBusy] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);

  const peca = linhas.find((l) => l.id === pecaId) ?? null;

  // Ao selecionar a peça: carrega receita salva; senão auto-preenche pela COMPOSIÇÃO do TB
  // (a matéria-prima do tubo está lá com a quantidade = quanto da barra o TB usa). Fallback: nome.
  useEffect(() => {
    if (!pecaId) return;
    void (async () => {
      const spec = await getPecaTubo(pecaId);
      if (spec) {
        setBitolaId(spec.bitola_id ?? "");
        setComprimento(String(Number(spec.comprimento_mm)));
        setTempo(String(Number(spec.tempo_corte_seg)));
        return;
      }
      // 1) Composição: acha o componente que é um tubo configurado → bitola + comprimento (qtd).
      const comps = await listComponentesDoMontado(pecaId);
      const bitolaPorProduto = new Map(
        tubos.filter((t) => t.produto_mestre_id).map((t) => [t.produto_mestre_id as string, t]),
      );
      const compTubo = comps.find((c) => bitolaPorProduto.has(c.componente_id));
      if (compTubo) {
        const bit = bitolaPorProduto.get(compTubo.componente_id)!;
        // Qtd na composição = decimal da barra (ex.: 0,2) → mm = decimal × comprimento da barra (6000).
        const mm = Number(compTubo.quantidade) * Number(bit.comprimento_barra_mm);
        setBitolaId(bit.id);
        setComprimento(String(mm));
        setTempo("");
        return;
      }
      // 2) Fallback: tenta pela medida no nome.
      const p = prodPorId.get(pecaId);
      const nome = normalize(`${p?.codigo ?? ""} ${p?.nome ?? ""}`);
      const nomeNS = nome.replace(/\s+/g, "");
      const achada = tubos.find((b) => { const d = dimDaBitola(b.nome); return d && nomeNS.includes(d); });
      const mComp = nome.match(/\b(\d{2,5})\s*mm\b/);
      setBitolaId(achada?.id ?? "");
      setComprimento(mComp ? mComp[1] : "");
      setTempo("");
    })();
  }, [pecaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultados = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return [];
    return linhas.filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q)).slice(0, 8);
  }, [linhas, busca]);

  const bitola = tubos.find((b) => b.id === bitolaId) ?? null;
  const calc = useMemo(() => {
    return calcularCustoPecaTubo({
      comprimentoMm: parseNum(comprimento),
      tempoSeg: parseNum(tempo),
      valorHoraLaser: configQuery.data?.valorHoraLaser ?? 0,
      tubo: bitola
        ? {
            rkg: rkgDe((() => { const id = acharProdutoDaBitola(bitola, linhas); return id ? prodPorId.get(id) : undefined; })()),
            pesoBarraKg: Number(bitola.peso_barra_kg ?? 0),
            comprimentoBarraMm: Number(bitola.comprimento_barra_mm),
          }
        : null,
    });
  }, [comprimento, tempo, bitola, prodPorId, linhas, configQuery.data]);

  const salvar = async () => {
    if (!pecaId) { toast.error("Selecione a peça."); return; }
    if (!bitolaId) { toast.error("Escolha a bitola do tubo."); return; }
    if (parseNum(comprimento) <= 0) { toast.error("Informe o comprimento."); return; }
    setBusy(true);
    try {
      await upsertPecaTubo({
        produto_mestre_id: pecaId,
        bitola_id: bitolaId,
        comprimento_mm: parseNum(comprimento),
        tempo_corte_seg: parseNum(tempo),
      });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success("Custo da peça de tubo salvo.");
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Custo de peça de tubo: <strong>material da barra</strong> (comprimento ÷ 6000 × R$/kg × peso)
        + <strong>corte a laser</strong> (tempo × valor-hora). Ao selecionar a peça, a bitola e o
        comprimento são pré-preenchidos pela medida do nome (ajuste se precisar).
      </p>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader><CardTitle className="text-base font-semibold">Peça e medidas</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative flex flex-col gap-1.5">
            <Label>Peça</Label>
            {peca ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span><span className="font-medium">{peca.nome}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{peca.codigo ?? ""}</span></span>
                <Button variant="ghost" size="sm" onClick={() => { setPecaId(null); setBusca(""); }}>Trocar</Button>
              </div>
            ) : (
              <>
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar peça de tubo (código ou nome)…" />
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Bitola do tubo</Label>
              <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={bitolaId} onChange={(e) => setBitolaId(e.target.value)}>
                <option value="">— nenhum</option>
                {tubos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Comprimento (mm)</Label>
              <Input type="number" min="0" step="0.01" value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tempo de corte (s)</Label>
              <Input type="number" min="0" step="0.1" value={tempo} onChange={(e) => setTempo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader><CardTitle className="text-base font-semibold">Custo da peça</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Row label="Material (tubo)" value={formatCurrency(calc.custoMaterial)} />
          <Row label="Corte a laser" value={formatCurrency(calc.custoLaser)} />
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Custo unitário</span>
            <span className="font-mono-num">{formatCurrency(calc.custoUnitario)}</span>
          </div>
          <div className="mt-2">
            <Button onClick={() => void salvar()} disabled={busy || !pecaId}>{busy ? "Salvando…" : "Salvar custo na peça"}</Button>
          </div>
        </CardContent>
      </Card>

      <ConfigTubos
        tubos={tubos}
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

interface ConfigTubosProps {
  tubos: ConfigBitola[];
  linhas: LinhaProduto[];
  prodPorId: Map<string, LinhaProduto>;
  aberto: boolean;
  onToggle: () => void;
  onChange: () => void;
}

function ConfigTubos({ tubos, linhas, prodPorId, aberto, onToggle, onChange }: ConfigTubosProps) {
  const [buscas, setBuscas] = useState<Record<string, string>>({});

  const apontar = async (id: string, produtoId: string | null) => {
    try {
      await updateBitola(id, { produto_mestre_id: produtoId });
      setBuscas((p) => ({ ...p, [id]: "" }));
      onChange();
      toast.success("Tubo configurado.");
    } catch (err) {
      toast.error(`Falha: ${errMsg(err)}`);
    }
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Configurar tubos (produto da nota)</CardTitle>
          <Button variant="ghost" size="sm" onClick={onToggle}>{aberto ? "Ocultar" : "Abrir"}</Button>
        </div>
        {aberto && (
          <p className="text-xs text-muted-foreground">
            Aponte cada bitola de tubo para o produto do catálogo que tem o R$/kg da nota. O peso da
            barra já está cadastrado.
          </p>
        )}
      </CardHeader>
      {aberto && (
        <CardContent className="flex flex-col gap-3">
          {tubos.map((b) => {
            const pid = acharProdutoDaBitola(b, linhas);
            const p = pid ? prodPorId.get(pid) : null;
            const rkg = rkgDe(p ?? undefined);
            const q = normalize((buscas[b.id] ?? "").trim());
            const res = q ? linhas.filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q)).slice(0, 6) : [];
            return (
              <div key={b.id} className="flex flex-col gap-1.5 border-b pb-2 last:border-0">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{b.nome} <span className="text-xs text-muted-foreground">({Number(b.peso_barra_kg)}kg)</span></span>
                  <span className="text-xs text-muted-foreground">
                    {p ? `${p.codigo ? `${p.codigo} · ` : ""}${p.nome} — ${rkg > 0 ? formatCurrency(rkg) + "/kg" : "sem custo"}` : "sem produto"}
                  </span>
                </div>
                <div className="relative">
                  <Input value={buscas[b.id] ?? ""} onChange={(e) => setBuscas((p2) => ({ ...p2, [b.id]: e.target.value }))}
                    placeholder="Apontar produto (código ou nome)…" className="h-8 text-xs" />
                  {q && res.length > 0 && (
                    <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg">
                      {res.map((l) => (
                        <li key={l.id}>
                          <button type="button" onClick={() => void apontar(b.id, l.id)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent">
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{l.codigo ?? "—"}</span>
                            <span className="truncate">{l.nome}</span>
                            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{l.resolvido.custoBase ? `${formatCurrency(l.resolvido.custoBase)}/kg` : "—"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {b.produto_mestre_id && (
                  <button type="button" onClick={() => void apontar(b.id, null)}
                    className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:underline">Limpar produto</button>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
