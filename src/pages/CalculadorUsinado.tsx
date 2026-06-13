import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useProdutosResolvidos } from "@/hooks/useProdutosResolvidos";
import { formatCurrency } from "@/lib/pricing";

function parseNum(v: string): number {
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalize(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Cálculo de peça USINADA (esqueleto).
 * Fórmula pretendida: valor da peça = (comprimento × R$/comprimento da bitola do
 * trefilado) + (comprimento × R$/comprimento da bitola do plástico) + mão de obra.
 * Falta o cadastro das bitolas (trefilado/plástico) com o preço por comprimento.
 */
export default function CalculadorUsinado() {
  const produtosQuery = useProdutosResolvidos();
  const linhas = produtosQuery.data ?? [];

  const [pecaId, setPecaId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [bitolaTref, setBitolaTref] = useState("");
  const [bitolaPlast, setBitolaPlast] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [maoDeObra, setMaoDeObra] = useState("");

  const peca = linhas.find((l) => l.id === pecaId) ?? null;
  const resultados = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return [];
    return linhas.filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q)).slice(0, 8);
  }, [linhas, busca]);

  // TODO: custo do material = comprimento × R$/comprimento(bitola). Precisa do cadastro de bitolas.
  const custoMaterial = 0;
  const custoTotal = custoMaterial + parseNum(maoDeObra);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Custo de peça usinada: material do <strong>trefilado</strong> + do <strong>plástico</strong>{" "}
        (comprimento × preço da bitola) + <strong>mão de obra</strong> da usinagem.
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
                <Button variant="ghost" size="sm" onClick={() => { setPecaId(null); setBusca(""); }}>
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar peça usinada (código ou nome)…"
                />
                {busca.trim() && resultados.length > 0 && (
                  <ul className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg">
                    {resultados.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => { setPecaId(l.id); setBusca(""); }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
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
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={bitolaTref}
                onChange={(e) => setBitolaTref(e.target.value)}
              >
                <option value="">— (aguardando cadastro)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Bitola do plástico</Label>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={bitolaPlast}
                onChange={(e) => setBitolaPlast(e.target.value)}
              >
                <option value="">— (aguardando cadastro)</option>
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
        <CardHeader>
          <CardTitle className="text-base font-semibold">Custo da peça</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Custo do material (trefilado + plástico)</span>
            <span className="font-mono-num">{formatCurrency(custoMaterial)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mão de obra</span>
            <span className="font-mono-num">{formatCurrency(parseNum(maoDeObra))}</span>
          </div>
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Custo unitário</span>
            <span className="font-mono-num">{formatCurrency(custoTotal)}</span>
          </div>
          <p className="text-xs text-amber-600">
            Material ainda não calcula: falta cadastrar as <strong>bitolas</strong> (trefilado e
            plástico) com o preço por comprimento. Me passe a lista de bitolas e preços que eu ligo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
