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
import type { Database } from "@/integrations/supabase/types";

export type ProdutoMontadoRow = Database["public"]["Tables"]["produtos_mestre"]["Row"];

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed.replace(",", "."));
  return Number.isFinite(num) ? num : NaN;
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
  const [categoria, setCategoria] = useState("");
  const [custo, setCusto] = useState("");
  const [preco, setPreco] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNome(produto?.nome ?? "");
    setCategoria(produto?.categoria ?? "");
    setCusto(produto?.custo_manual != null ? String(produto.custo_manual) : "");
    setPreco(produto?.preco_manual != null ? String(produto.preco_manual) : "");
  }, [produto]);

  if (!produto) return null;

  const salvar = async () => {
    const nomeLimpo = nome.trim();
    if (nomeLimpo === "") {
      toast.error("Informe o nome do produto.");
      return;
    }
    const custoNum = parseNumber(custo);
    if (Number.isNaN(custoNum) || (custoNum != null && custoNum < 0)) {
      toast.error("Custo manual inválido.");
      return;
    }
    const precoNum = parseNumber(preco);
    if (precoNum == null || Number.isNaN(precoNum) || precoNum <= 0) {
      toast.error("Informe um preço de venda maior que zero.");
      return;
    }
    setBusy(true);
    try {
      await updateProdutoMestre(produto.id, {
        nome: nomeLimpo,
        categoria: categoria.trim() === "" ? null : categoria.trim(),
        custo_manual: custoNum,
        preco_manual: precoNum,
      });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      toast.success("Produto montado atualizado.");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar produto montado</DialogTitle>
          <DialogDescription>
            Ajuste nome, categoria, custo e preço manual deste produto montado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-nome">Nome</Label>
            <Input
              id="edit-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-categoria">Categoria</Label>
            <Input
              id="edit-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-custo">Custo manual (R$)</Label>
              <Input
                id="edit-custo"
                type="number"
                min="0"
                step="0.01"
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                placeholder="0,00"
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-preco">Preço de venda (R$)</Label>
              <Input
                id="edit-preco"
                type="number"
                min="0"
                step="0.01"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                placeholder="0,00"
                disabled={busy}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void salvar()} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
