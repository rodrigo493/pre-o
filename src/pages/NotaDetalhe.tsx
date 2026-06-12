import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotaConteudo from "@/components/NotaConteudo";
import { getNotaById } from "@/repositories/notasRepo";
import { listItensPorNota } from "@/repositories/itensNotaRepo";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

export default function NotaDetalhe() {
  const { id = "" } = useParams();

  const notaQuery = useQuery({ queryKey: ["nota", id], queryFn: () => getNotaById(id), enabled: !!id });
  const itensQuery = useQuery({
    queryKey: ["itens-nota", id],
    queryFn: () => listItensPorNota(id),
    enabled: !!id,
  });

  const nota = notaQuery.data;
  const itens = itensQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/notas">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {nota ? `Nota ${nota.numero ? `nº ${nota.numero}` : ""}` : "Nota"}
        </h1>
      </div>

      {notaQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : notaQuery.isError ? (
        <p className="text-sm text-destructive">Falha ao carregar: {errMsg(notaQuery.error)}</p>
      ) : !nota ? (
        <p className="text-sm text-muted-foreground">Nota não encontrada.</p>
      ) : (
        <NotaConteudo nota={nota} itens={itens} carregandoItens={itensQuery.isLoading} />
      )}
    </div>
  );
}
