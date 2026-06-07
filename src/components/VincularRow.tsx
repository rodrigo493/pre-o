import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/pricing";
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

export default function VincularRow({
  item,
  mestres,
  outrosMesmoCprod,
  busy,
  onVincularExistente,
  onCriarMestre,
}: VincularRowProps) {
  const [mestreId, setMestreId] = useState<string>("");
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState(item.descricao);
  const [lote, setLote] = useState(true);

  const aplicarLote = lote && outrosMesmoCprod > 0;

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{item.cprod}</TableCell>
      <TableCell className="max-w-[24rem]">
        <span className="line-clamp-2">{item.descricao}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
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
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setCriando(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={mestreId} onValueChange={setMestreId} disabled={busy}>
                <SelectTrigger className="sm:w-64">
                  <SelectValue placeholder="Vincular a um mestre…" />
                </SelectTrigger>
                <SelectContent>
                  {mestres.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy || mestreId.length === 0}
                  onClick={() => onVincularExistente(item, mestreId, aplicarLote)}
                >
                  Vincular
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setCriando(true)}
                >
                  Criar mestre
                </Button>
              </div>
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
