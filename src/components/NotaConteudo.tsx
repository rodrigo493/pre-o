import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/pricing";
import type { Database } from "@/integrations/supabase/types";

type NotaRow = Database["public"]["Tables"]["notas"]["Row"];
type ItemRow = Database["public"]["Tables"]["itens_nota"]["Row"];

function dataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

interface NotaConteudoProps {
  nota: NotaRow;
  itens: ItemRow[];
  carregandoItens?: boolean;
}

/** Conteúdo completo de uma nota: dados + itens + total. Reutilizado na tela
 *  da nota individual e na visualização em lote. */
export default function NotaConteudo({ nota, itens, carregandoItens }: NotaConteudoProps) {
  const total = itens.reduce(
    (s, i) => s + Number(i.custo_unitario) * Number(i.quantidade ?? 1),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Dados da nota{nota.numero ? ` nº ${nota.numero}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Fornecedor: </span>
            <strong>{nota.fornecedor ?? "—"}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Data de emissão: </span>
            <strong>{dataBR(nota.data_emissao)}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Número: </span>
            <strong>{nota.numero ?? "—"}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Origem: </span>
            <strong className="uppercase">{nota.origem}</strong>
          </div>
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Arquivo: </span>
            <span className="text-xs">{nota.arquivo_nome ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Itens{!carregandoItens ? ` (${itens.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {carregandoItens ? (
            <p className="text-sm text-muted-foreground">Carregando itens…</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item nesta nota.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="[&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                    <TableHead>cProd</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Unid.</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Custo unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead>Vínculo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.cprod}</TableCell>
                      <TableCell className="max-w-[26rem]">
                        <span className="line-clamp-2">{i.descricao}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{i.unidade ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono-num text-muted-foreground">
                        {Number(i.quantidade ?? 1)}
                      </TableCell>
                      <TableCell className="text-right font-mono-num text-muted-foreground">
                        {formatCurrency(Number(i.custo_unitario))}
                      </TableCell>
                      <TableCell className="text-right font-mono-num">
                        {formatCurrency(Number(i.custo_unitario) * Number(i.quantidade ?? 1))}
                      </TableCell>
                      <TableCell>
                        {i.produto_mestre_id ? (
                          <span className="text-xs text-emerald-600">vinculado</span>
                        ) : (
                          <span className="text-xs text-amber-600">pendente</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-right text-sm">
                Total da nota:{" "}
                <strong className="font-mono-num">{formatCurrency(total)}</strong>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
