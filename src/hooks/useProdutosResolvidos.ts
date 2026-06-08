import { useQuery } from "@tanstack/react-query";
import { listProdutosMestre } from "@/repositories/produtosMestreRepo";
import { listItensComData } from "@/repositories/itensNotaRepo";
import { getConfig } from "@/repositories/configRepo";
import { resolvePrice, type ItemNota, type ProdutoMestre, type ResolvedPrice } from "@/lib/priceResolution";

export interface LinhaProduto extends ProdutoMestre { resolvido: ResolvedPrice; }

export function useProdutosResolvidos() {
  return useQuery({
    queryKey: ["produtos-resolvidos"],
    queryFn: async (): Promise<LinhaProduto[]> => {
      const [mestres, itens, cfg] = await Promise.all([
        listProdutosMestre(), listItensComData(), getConfig(),
      ]);
      const hoje = new Date();
      const porMestre = new Map<string, ItemNota[]>();
      for (const it of itens) {
        if (!it.produto_mestre_id) continue;
        const arr = porMestre.get(it.produto_mestre_id) ?? [];
        arr.push({ id: it.id, custoUnitario: Number(it.custo_unitario), dataEmissao: it.data_emissao, notaId: it.nota_id, notaNumero: it.nota_numero ?? undefined });
        porMestre.set(it.produto_mestre_id, arr);
      }
      return mestres.map((m) => {
        const produto: ProdutoMestre = { id: m.id, nome: m.nome, categoria: m.categoria, tipo: m.tipo, custoManual: m.custo_manual, precoManual: m.preco_manual, codigo: m.codigo };
        return { ...produto, resolvido: resolvePrice(produto, porMestre.get(m.id) ?? [], cfg, hoje) };
      });
    },
  });
}
