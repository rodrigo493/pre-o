import { useEffect, useState } from "react";
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
import { updateProdutoMestre } from "@/repositories/produtosMestreRepo";
import type { LinhaProduto } from "@/hooks/useProdutosResolvidos";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

interface EditarPrecoDialogProps {
  linha: LinhaProduto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditarPrecoDialog({ linha, open, onOpenChange }: EditarPrecoDialogProps) {
  const queryClient = useQueryClient();
  const [valor, setValor] = useState("");
  const [unidade, setUnidade] = useState("");
  const [unidadeSec, setUnidadeSec] = useState("");
  const [fator, setFator] = useState("");
  const [op, setOp] = useState<"dividir" | "multiplicar">("dividir");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValor(linha?.precoManual != null ? String(linha.precoManual) : "");
    setUnidade(linha?.unidade ?? "");
    setUnidadeSec(linha?.unidadeSecundaria ?? "");
    setFator(linha?.fatorConversao != null ? String(linha.fatorConversao) : "");
    setOp(linha?.conversaoOp ?? "dividir");
  }, [linha]);

  if (!linha) return null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
    queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
  };

  const salvar = async () => {
    const num = Number(valor.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Informe um preço manual maior que zero.");
      return;
    }
    setBusy(true);
    try {
      await updateProdutoMestre(linha.id, { preco_manual: num });
      invalidate();
      toast.success(`Preço travado em ${num.toFixed(2)}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const salvarConversao = async () => {
    const fatorNum = fator.trim() === "" ? null : Number(fator.replace(",", "."));
    if (fatorNum != null && (!Number.isFinite(fatorNum) || fatorNum <= 0)) {
      toast.error("Fator de conversão deve ser maior que zero (ou vazio).");
      return;
    }
    setBusy(true);
    try {
      await updateProdutoMestre(linha.id, {
        unidade: unidade.trim() || null,
        unidade_secundaria: unidadeSec.trim() || null,
        fator_conversao: fatorNum,
        conversao_op: fatorNum != null ? op : null,
      });
      invalidate();
      toast.success("Conversão salva.");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const destravar = async () => {
    setBusy(true);
    try {
      await updateProdutoMestre(linha.id, { preco_manual: null });
      invalidate();
      toast.success("Preço destravado.");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Falha ao destravar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const travado = linha.precoManual != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar preço — {linha.nome}</DialogTitle>
          <DialogDescription>
            Travar define um preço manual fixo. Destravar volta ao preço calculado
            {linha.tipo === "montado" ? " (produto montado exige preço manual)" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          <Label htmlFor="preco-manual">Preço manual (R$)</Label>
          <Input
            id="preco-manual"
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            disabled={busy}
          />
          <div className="flex justify-end gap-2">
            {travado && (
              <Button variant="outline" size="sm" onClick={() => void destravar()} disabled={busy}>
                Destravar
              </Button>
            )}
            <Button size="sm" onClick={() => void salvar()} disabled={busy}>
              Salvar preço
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">Conversão de custo da nota</p>
          <p className="-mt-2 text-xs text-muted-foreground">
            Aplica <strong>sempre</strong> no custo que vem da nota (não depende da unidade).
            <br />
            <strong>Dividir</strong>: nota vem num pacote → custo unitário (ex.: cento ÷ 100).
            <br />
            <strong>Multiplicar</strong>: nota vem fracionada → custo da peça (ex.: kg × 47,1).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="conv-op" className="text-xs">Operação</Label>
              <select
                id="conv-op"
                value={op}
                onChange={(e) => setOp(e.target.value as "dividir" | "multiplicar")}
                disabled={busy}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="dividir">Dividir o custo por (÷)</option>
                <option value="multiplicar">Multiplicar o custo por (×)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="fator" className="text-xs">Fator</Label>
              <Input
                id="fator"
                type="number"
                min="0"
                step="0.0001"
                value={fator}
                onChange={(e) => setFator(e.target.value)}
                placeholder="ex.: 100"
                disabled={busy}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Deixe o fator vazio para não converter. (Unidade do produto:{" "}
            {linha.unidade ?? "—"})
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => void salvarConversao()} disabled={busy}>
            Salvar conversão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
