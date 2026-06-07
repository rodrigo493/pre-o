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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValor(linha?.precoManual != null ? String(linha.precoManual) : "");
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
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {travado && (
            <Button variant="outline" onClick={() => void destravar()} disabled={busy}>
              Destravar
            </Button>
          )}
          <Button onClick={() => void salvar()} disabled={busy}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
