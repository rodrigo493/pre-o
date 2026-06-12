import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProdutosResolvidos } from "@/hooks/useProdutosResolvidos";
import { listConfigChapas } from "@/repositories/configChapasRepo";
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

export default function Calculador() {
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

  const linhas = produtosQuery.data ?? [];
  const chapas = chapasQuery.data ?? [];

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
      .slice(0, 8);
  }, [linhas, busca]);

  const chapa = chapas.find((c) => Number(c.espessura) === espessura) ?? null;
  const valorChapaUnit = useMemo(() => {
    if (!chapa) return 0;
    const cod = chapa.chapa_codigo.trim().toUpperCase();
    const prod = linhas.find((l) => (l.codigo ?? "").trim().toUpperCase() === cod);
    return prod?.resolvido.custoBase ?? 0;
  }, [chapa, linhas]);

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calculador de peças (LA)</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Custo de peças de chapa cortadas a laser: material (% da chapa × R$/kg das notas × peso)
          + tempo de laser. O custo fica salvo na peça e se atualiza sozinho com novas notas.
        </p>
      </div>

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
            <Row label={`Valor da chapa por unidade (${chapa.chapa_codigo})`} value={valorChapaUnit > 0 ? formatCurrency(valorChapaUnit) : "sem custo na nota"} />
            <Row label="Custo do material" value={formatCurrency(calc.custoMaterial)} />
            <Row label="Custo do laser" value={formatCurrency(calc.custoLaser)} />
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Custo unitário</span>
              <span className="font-mono-num">{formatCurrency(calc.custoUnitario)}</span>
            </div>
            {valorChapaUnit === 0 && (
              <p className="text-xs text-amber-600">Chapa sem custo: vincule a chapa numa nota (com fator × peso) para o valor por unidade aparecer.</p>
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
