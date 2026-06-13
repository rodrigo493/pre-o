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
import { createProdutoMestre, updateProdutoMestre } from "@/repositories/produtosMestreRepo";

function errMsg(err: unknown): string {
  if (err instanceof Error) {
    if (/duplicate key|23505/i.test(err.message)) return "Já existe um produto com esse código.";
    return err.message;
  }
  return "erro desconhecido";
}

export interface ProdutoEditavel {
  id: string;
  codigo: string | null;
  nome: string;
  categoria: string | null;
  unidade: string | null;
  tipo: "comprado" | "montado";
}

interface NovoProdutoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando definido, o diálogo edita esse produto em vez de criar um novo. */
  editar?: ProdutoEditavel | null;
}

export default function NovoProdutoDialog({ open, onOpenChange, editar }: NovoProdutoDialogProps) {
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [unidade, setUnidade] = useState("");
  const [tipo, setTipo] = useState<"comprado" | "montado">("comprado");
  const [busy, setBusy] = useState(false);

  const editando = !!editar;

  useEffect(() => {
    setCodigo(editar?.codigo ?? "");
    setNome(editar?.nome ?? "");
    setCategoria(editar?.categoria ?? "");
    setUnidade(editar?.unidade ?? "");
    setTipo(editar?.tipo ?? "comprado");
  }, [editar, open]);

  const salvar = async () => {
    if (nome.trim() === "") { toast.error("Informe o nome do produto."); return; }
    setBusy(true);
    try {
      const patch = {
        codigo: codigo.trim() === "" ? null : codigo.trim(),
        nome: nome.trim(),
        categoria: categoria.trim() === "" ? null : categoria.trim(),
        unidade: unidade.trim() === "" ? null : unidade.trim().toUpperCase(),
        tipo,
      };
      if (editar) {
        await updateProdutoMestre(editar.id, patch);
      } else {
        await createProdutoMestre(patch);
      }
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      toast.success(editar ? "Produto atualizado." : "Produto criado no catálogo.");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Falha ao salvar produto: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar produto" : "Novo produto no catálogo"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "Edite código, nome, grupo, unidade e tipo do produto."
              : "Cadastre um produto/código direto no catálogo, sem importar PDF. Útil para chapas e matérias-primas que faltaram na importação."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-codigo">Código</Label>
            <Input
              id="np-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="ex.: CH.LISA.1200X3000X3,00MM"
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-nome">Nome *</Label>
            <Input
              id="np-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex.: CHAPA A36 1200x3000x3,00MM"
              disabled={busy}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="np-categoria">Grupo</Label>
              <Input
                id="np-categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="ex.: 34 - CHAPA"
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="np-unidade">Unidade</Label>
              <Input
                id="np-unidade"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="ex.: KG, UN"
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="np-tipo">Tipo</Label>
              <select
                id="np-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "comprado" | "montado")}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                disabled={busy}
              >
                <option value="comprado">Comprado</option>
                <option value="montado">Montado/Fabricado</option>
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void salvar()} disabled={busy}>
            {busy ? "Criando…" : "Criar produto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
