import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/pricing";
import { bestMatch } from "@/lib/fuzzyMatch";
import { normalizeUnidade } from "@/lib/unitConvert";
import type { Database } from "@/integrations/supabase/types";

type ItemRow = Database["public"]["Tables"]["itens_nota"]["Row"];
type MestreRow = Database["public"]["Tables"]["produtos_mestre"]["Row"];

export interface VincularRowProps {
  item: ItemRow;
  mestres: MestreRow[];
  /** Quantos OUTROS pendentes têm o mesmo cprod deste item. */
  outrosMesmoCprod: number;
  busy: boolean;
  /** Vincula a um mestre existente. lote = aplicar a todos com o mesmo cprod. */
  onVincularExistente: (item: ItemRow, mestreId: string, lote: boolean) => void;
  /** Cria um mestre novo a partir da descrição e vincula. */
  onCriarMestre: (item: ItemRow, nome: string, lote: boolean) => void;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export default function VincularRow({
  item,
  mestres,
  outrosMesmoCprod,
  busy,
  onVincularExistente,
  onCriarMestre,
}: VincularRowProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState(item.descricao);
  const [lote, setLote] = useState(true);

  const aplicarLote = lote && outrosMesmoCprod > 0;

  // Sugestão automática pela descrição do item da nota.
  const sugestao = useMemo(() => {
    const cand = mestres.map((m) => ({ id: m.id, text: `${m.codigo ?? ""} ${m.nome}` }));
    const r = bestMatch(item.descricao, cand, 0.45);
    return r ? mestres.find((m) => m.id === r.id) ?? null : null;
  }, [mestres, item.descricao]);

  // Resultados da busca (top 8) por código + nome.
  const resultados = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return mestres
      .filter((m) => normalize(`${m.codigo ?? ""} ${m.nome}`).includes(q))
      .slice(0, 8);
  }, [mestres, query]);

  const selecionado = mestres.find((m) => m.id === selectedId) ?? null;

  const selecionar = (m: MestreRow) => {
    setSelectedId(m.id);
    setQuery(m.nome);
  };

  // Aviso de unidade divergente entre a nota e o produto selecionado.
  const unidadeDivergente =
    selecionado &&
    item.unidade &&
    selecionado.unidade &&
    normalizeUnidade(item.unidade) !== normalizeUnidade(selecionado.unidade);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{item.cprod}</TableCell>
      <TableCell className="max-w-[24rem]">
        <span className="line-clamp-2">{item.descricao}</span>
      </TableCell>
      <TableCell className="text-right font-mono-num text-muted-foreground">
        {formatCurrency(Number(item.custo_unitario))}
      </TableCell>
      <TableCell className="text-muted-foreground">{item.unidade ?? "—"}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-2">
          {criando ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                placeholder="Nome do produto mestre"
                className="sm:w-64"
                disabled={busy}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy || nomeNovo.trim().length === 0}
                  onClick={() => onCriarMestre(item, nomeNovo.trim(), aplicarLote)}
                >
                  Criar e vincular
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCriando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sugestao && sugestao.id !== selectedId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => selecionar(sugestao)}
                  className="self-start rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-left text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  Sugestão: <strong>{sugestao.nome}</strong>
                  {sugestao.codigo ? ` (${sugestao.codigo})` : ""}
                </button>
              )}

              <div className="relative">
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedId("");
                  }}
                  placeholder="Buscar no catálogo (código ou descrição)…"
                  className="sm:w-72"
                  disabled={busy}
                />
                {query.trim() && !selectedId && resultados.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md sm:w-72">
                    {resultados.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => selecionar(m)}
                          className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          <span className="font-medium">{m.nome}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {m.codigo ?? "—"}
                            {m.unidade ? ` · ${m.unidade}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy || !selectedId}
                  onClick={() => onVincularExistente(item, selectedId, aplicarLote)}
                >
                  Vincular
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setCriando(true)}>
                  Criar mestre
                </Button>
              </div>

              {unidadeDivergente && (
                <p className="text-xs text-amber-600">
                  Unidade da nota ({item.unidade}) difere do produto ({selecionado!.unidade}).
                  Defina o fator de conversão no produto.
                </p>
              )}
            </div>
          )}

          {outrosMesmoCprod > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={lote}
                onChange={(e) => setLote(e.target.checked)}
                disabled={busy}
                className="h-3.5 w-3.5"
              />
              Aplicar a todos com este código ({outrosMesmoCprod} outro
              {outrosMesmoCprod > 1 ? "s" : ""})
            </label>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
