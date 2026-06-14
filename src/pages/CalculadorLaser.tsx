import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProdutosResolvidos } from "@/hooks/useProdutosResolvidos";
import { listConfigChapas, setChapaProduto } from "@/repositories/configChapasRepo";
import { getPecaLaser, upsertPecaLaser } from "@/repositories/pecasLaserRepo";
import { getConfig } from "@/repositories/configRepo";
import { calcularCustoPecaLaser } from "@/lib/laserCost";
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

export default function CalculadorLaser() {
  const queryClient = useQueryClient();
  const produtosQuery = useProdutosResolvidos();
  const chapasQuery = useQuery({ queryKey: ["config-chapas"], queryFn: listConfigChapas });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: getConfig });

  const [pecaId, setPecaId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [espessura, setEspessura] = useState<number | null>(null);
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [tempo, setTempo] = useState("");
  const [busy, setBusy] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [configBuscas, setConfigBuscas] = useState<Record<string, string>>({});

  const linhas = produtosQuery.data ?? [];
  const chapas = chapasQuery.data ?? [];

  const definirChapa = async (esp: number, produtoId: string | null) => {
    try {
      await setChapaProduto(esp, produtoId);
      setConfigBuscas((prev) => ({ ...prev, [String(esp)]: "" }));
      queryClient.invalidateQueries({ queryKey: ["config-chapas"] });
      toast.success("Chapa configurada.");
    } catch (err) {
      toast.error(`Falha ao configurar chapa: ${errMsg(err)}`);
    }
  };

  const peca = linhas.find((l) => l.id === pecaId) ?? null;

  // Carrega receita existente ao selecionar a peça.
  useEffect(() => {
    if (!pecaId) return;
    void (async () => {
      const spec = await getPecaLaser(pecaId);
      if (spec) {
        setEspessura(Number(spec.espessura));
        setLargura(String(Number(spec.largura_mm)));
        setComprimento(String(Number(spec.comprimento_mm)));
        setTempo(String(Number(spec.tempo_corte_seg)));
      } else {
        setEspessura(null); setLargura(""); setComprimento(""); setTempo("");
      }
    })();
  }, [pecaId]);

  const resultados = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return [];
    return linhas
      .filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q))
      .slice(0, 40);
  }, [linhas, busca]);

  const chapa = chapas.find((c) => Number(c.espessura) === espessura) ?? null;
  // Recupera o R$/kg da chapa (desfaz um fator × se houver) e multiplica pelo peso da config.
  // Robusto: funciona com a chapa em R$/kg OU já por unidade (fator × peso).
  const rkgChapa = useMemo(() => {
    if (!chapa) return 0;
    const prod = chapa.produto_mestre_id
      ? linhas.find((l) => l.id === chapa.produto_mestre_id)
      : linhas.find(
          (l) => (l.codigo ?? "").trim().toUpperCase() === chapa.chapa_codigo.trim().toUpperCase(),
        );
    const base = prod?.resolvido.custoBase ?? 0;
    const fator = prod?.fatorConversao ?? null;
    return prod?.conversaoOp === "multiplicar" && fator && fator > 0 ? base / fator : base;
  }, [chapa, linhas]);
  const valorChapaUnit = rkgChapa * (chapa ? Number(chapa.peso_kg) : 0);

  const calc = useMemo(() => {
    if (!chapa) return null;
    return calcularCustoPecaLaser({
      larguraMm: parseNum(largura),
      comprimentoMm: parseNum(comprimento),
      tempoSeg: parseNum(tempo),
      areaChapaMm2: Number(chapa.area_mm2),
      valorChapaUnit,
      valorHoraLaser: configQuery.data?.valorHoraLaser ?? 0,
    });
  }, [chapa, largura, comprimento, tempo, valorChapaUnit, configQuery.data]);

  const salvar = async () => {
    if (!pecaId) { toast.error("Selecione a peça."); return; }
    if (espessura == null) { toast.error("Escolha a espessura."); return; }
    if (parseNum(largura) <= 0 || parseNum(comprimento) <= 0) {
      toast.error("Informe largura e comprimento."); return;
    }
    setBusy(true);
    try {
      await upsertPecaLaser({
        produto_mestre_id: pecaId,
        espessura,
        largura_mm: parseNum(largura),
        comprimento_mm: parseNum(comprimento),
        tempo_corte_seg: parseNum(tempo),
      });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success("Custo da peça salvo. Atualiza sozinho com novas notas da chapa.");
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Custo de peças de chapa cortadas a laser: material (% da chapa × R$/kg das notas × peso)
        + tempo de laser. O custo fica salvo na peça e se atualiza sozinho com novas notas.
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
                <span><span className="font-medium">{peca.nome}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{peca.codigo ?? ""}</span></span>
                <Button variant="ghost" size="sm" onClick={() => { setPecaId(null); setBusca(""); }}>Trocar</Button>
              </div>
            ) : (
              <>
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar peça LA (código ou nome)…" />
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

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label>Espessura</Label>
              <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={espessura ?? ""} onChange={(e) => setEspessura(e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {chapas.map((c) => (
                  <option key={String(c.espessura)} value={Number(c.espessura)}>
                    {String(c.espessura).replace(".", ",")} mm
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Largura (mm)</Label>
              <Input type="number" min="0" step="0.01" value={largura} onChange={(e) => setLargura(e.target.value)} />
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

      {calc && chapa && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Custo da peça</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Área da peça" value={`${calc.areaPecaMm2.toLocaleString("pt-BR")} mm²`} />
            <Row label="% da chapa usada" value={`${calc.percentual.toFixed(3)} %`} />
            <Row label={`R$/kg da chapa (${chapa.chapa_codigo})`} value={rkgChapa > 0 ? formatCurrency(rkgChapa) : "sem custo"} />
            <Row label={`Valor da chapa por unidade (× ${Number(chapa.peso_kg)} kg)`} value={valorChapaUnit > 0 ? formatCurrency(valorChapaUnit) : "sem custo"} />
            <Row label="Custo do material" value={formatCurrency(calc.custoMaterial)} />
            <Row label="Custo do laser" value={formatCurrency(calc.custoLaser)} />
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Custo unitário</span>
              <span className="font-mono-num">{formatCurrency(calc.custoUnitario)}</span>
            </div>
            {valorChapaUnit === 0 && (
              <p className="text-xs text-amber-600">
                Chapa sem custo. Em "Configurar chapas" (abaixo), aponte essa espessura para o produto
                da chapa que tenha custo, vinculado numa nota com fator × peso (valor por unidade).
              </p>
            )}
            {(configQuery.data?.valorHoraLaser ?? 0) === 0 && (
              <p className="text-xs text-amber-600">Valor da hora do laser está 0 — configure em Configurações.</p>
            )}
            <div className="mt-2">
              <Button onClick={() => void salvar()} disabled={busy || !pecaId}>
                {busy ? "Salvando…" : "Salvar custo na peça"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configurar chapas: qual produto do catálogo é a chapa de cada espessura */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold">Configurar chapas</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setMostrarConfig((v) => !v)}>
              {mostrarConfig ? "Ocultar" : "Abrir"}
            </Button>
          </div>
          {mostrarConfig && (
            <p className="text-xs text-muted-foreground">
              Aponte cada espessura para o produto do catálogo que tem o custo da chapa (em R$/kg).
              Use isto quando o produto da chapa não tem o código padrão.
            </p>
          )}
        </CardHeader>
        {mostrarConfig && (
          <CardContent className="flex flex-col gap-4">
            {chapas.map((c) => {
              const esp = Number(c.espessura);
              const atual = c.produto_mestre_id
                ? linhas.find((l) => l.id === c.produto_mestre_id)
                : linhas.find((l) => (l.codigo ?? "").trim().toUpperCase() === c.chapa_codigo.trim().toUpperCase());
              const baseAtual = atual?.resolvido.custoBase ?? null;
              const fatorAtual = atual?.fatorConversao ?? null;
              const rkgAtual =
                baseAtual != null
                  ? atual?.conversaoOp === "multiplicar" && fatorAtual && fatorAtual > 0
                    ? baseAtual / fatorAtual
                    : baseAtual
                  : null;
              const valUn = rkgAtual != null ? rkgAtual * Number(c.peso_kg) : null;
              const q = normalize((configBuscas[String(esp)] ?? "").trim());
              const res = q
                ? linhas.filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q)).slice(0, 6)
                : [];
              return (
                <div key={String(esp)} className="flex flex-col gap-1.5 border-b pb-3 last:border-0">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{String(esp).replace(".", ",")} mm</span>
                    <span className="text-xs text-muted-foreground">
                      {atual
                        ? `${atual.codigo ? `${atual.codigo} · ` : ""}${atual.nome} — ${valUn && valUn > 0 ? formatCurrency(valUn) + "/un" : "sem custo"}`
                        : "nenhum produto"}
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      value={configBuscas[String(esp)] ?? ""}
                      onChange={(e) => setConfigBuscas((p) => ({ ...p, [String(esp)]: e.target.value }))}
                      placeholder="Trocar: buscar produto da chapa (código ou nome)…"
                      className="h-8 text-xs"
                    />
                    {q && res.length > 0 && (
                      <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg">
                        {res.map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              onClick={() => void definirChapa(esp, l.id)}
                              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                            >
                              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{l.codigo ?? "—"}</span>
                              <span className="truncate">{l.nome}</span>
                              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                                {l.resolvido.custoBase ? `${formatCurrency(l.resolvido.custoBase)}/un` : "—"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {c.produto_mestre_id && (
                    <button
                      type="button"
                      onClick={() => void definirChapa(esp, null)}
                      className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Voltar para o código padrão ({c.chapa_codigo})
                    </button>
                  )}
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>
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
