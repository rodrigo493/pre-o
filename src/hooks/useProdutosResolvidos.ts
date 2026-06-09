import { useQuery } from "@tanstack/react-query";
import { listProdutosMestre } from "@/repositories/produtosMestreRepo";
import { listItensComData } from "@/repositories/itensNotaRepo";
import { listComponentes } from "@/repositories/componentesMontadoRepo";
import { getConfig } from "@/repositories/configRepo";
import { resolvePrice, type ItemNota, type ProdutoMestre, type ResolvedPrice } from "@/lib/priceResolution";

export interface LinhaProduto extends ProdutoMestre { resolvido: ResolvedPrice; maisVendido: boolean; }

export function useProdutosResolvidos() {
  return useQuery({
    queryKey: ["produtos-resolvidos"],
    queryFn: async (): Promise<LinhaProduto[]> => {
      const [mestres, itens, cfg, componentes] = await Promise.all([
        listProdutosMestre(), listItensComData(), getConfig(), listComponentes(),
      ]);
      const hoje = new Date();
      const porMestre = new Map<string, ItemNota[]>();
      for (const it of itens) {
        if (!it.produto_mestre_id) continue;
        const arr = porMestre.get(it.produto_mestre_id) ?? [];
        arr.push({ id: it.id, custoUnitario: Number(it.custo_unitario), dataEmissao: it.data_emissao, notaId: it.nota_id, notaNumero: it.nota_numero ?? undefined, unidade: it.unidade });
        porMestre.set(it.produto_mestre_id, arr);
      }

      const base = (m: typeof mestres[number]): ProdutoMestre => ({
        id: m.id, nome: m.nome, categoria: m.categoria, tipo: m.tipo,
        custoManual: m.custo_manual, precoManual: m.preco_manual, codigo: m.codigo,
        unidade: m.unidade, unidadeSecundaria: m.unidade_secundaria, fatorConversao: m.fator_conversao,
      });

      // Passo 1: custo base de cada produto (componentes ainda não somados).
      const custoBasePorId = new Map<string, number | null>();
      for (const m of mestres) {
        const r = resolvePrice(base(m), porMestre.get(m.id) ?? [], cfg, hoje);
        custoBasePorId.set(m.id, r.custoBase);
      }

      // Componentes agrupados por montado.
      const compPorMontado = new Map<string, Array<{ componenteId: string; qtd: number }>>();
      for (const c of componentes) {
        const arr = compPorMontado.get(c.montado_id) ?? [];
        arr.push({ componenteId: c.componente_id, qtd: Number(c.quantidade) });
        compPorMontado.set(c.montado_id, arr);
      }

      // Passo 2: resolve cada produto; montados somam o custo dos componentes.
      return mestres.map((m) => {
        const produto = base(m);
        if (m.tipo === "montado") {
          const comps = compPorMontado.get(m.id);
          if (comps && comps.length > 0) {
            produto.custoComponentes = comps.reduce(
              (s, c) => s + (custoBasePorId.get(c.componenteId) ?? 0) * c.qtd,
              0,
            );
          }
        }
        return {
          ...produto,
          maisVendido: m.mais_vendido ?? false,
          resolvido: resolvePrice(produto, porMestre.get(m.id) ?? [], cfg, hoje),
        };
      });
    },
  });
}
