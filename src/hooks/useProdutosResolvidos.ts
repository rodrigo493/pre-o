import { useQuery } from "@tanstack/react-query";
import { listProdutosMestre } from "@/repositories/produtosMestreRepo";
import { listItensComData } from "@/repositories/itensNotaRepo";
import { listComponentes } from "@/repositories/componentesMontadoRepo";
import { getConfig } from "@/repositories/configRepo";
import { resolvePrice, type ItemNota, type ProdutoMestre, type ResolvedPrice } from "@/lib/priceResolution";

export interface LinhaProduto extends ProdutoMestre { resolvido: ResolvedPrice; maisVendido: boolean; temVinculo: boolean; }

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

      const mestrePorId = new Map(mestres.map((m) => [m.id, m]));

      // Custo de matéria-prima (comprado) = maior custo das notas (sem componentes).
      const custoCompradoPorId = new Map<string, number | null>();
      for (const m of mestres) {
        if (m.tipo !== "montado") {
          const r = resolvePrice(base(m), porMestre.get(m.id) ?? [], cfg, hoje);
          custoCompradoPorId.set(m.id, r.custoBase);
        }
      }

      // Componentes agrupados por montado.
      const compPorMontado = new Map<string, Array<{ componenteId: string; qtd: number }>>();
      for (const c of componentes) {
        const arr = compPorMontado.get(c.montado_id) ?? [];
        arr.push({ componenteId: c.componente_id, qtd: Number(c.quantidade) });
        compPorMontado.set(c.montado_id, arr);
      }

      // Custo recursivo: montagem soma matérias-primas + outras montagens (com memo e guarda de ciclo).
      const memo = new Map<string, number>();
      const visitando = new Set<string>();
      const custoDe = (id: string): number => {
        const cache = memo.get(id);
        if (cache != null) return cache;
        const m = mestrePorId.get(id);
        if (!m) return 0;
        if (m.tipo !== "montado") {
          const v = custoCompradoPorId.get(id) ?? 0;
          memo.set(id, v);
          return v;
        }
        if (visitando.has(id)) return 0; // ciclo: evita recursão infinita
        visitando.add(id);
        const comps = compPorMontado.get(id) ?? [];
        const v =
          comps.length > 0
            ? comps.reduce((s, c) => s + custoDe(c.componenteId) * c.qtd, 0)
            : Number(m.custo_manual ?? 0);
        visitando.delete(id);
        memo.set(id, v);
        return v;
      };

      return mestres.map((m) => {
        const produto = base(m);
        if (m.tipo === "montado" && (compPorMontado.get(m.id)?.length ?? 0) > 0) {
          produto.custoComponentes = custoDe(m.id);
        }
        return {
          ...produto,
          maisVendido: m.mais_vendido ?? false,
          temVinculo: (porMestre.get(m.id)?.length ?? 0) > 0,
          resolvido: resolvePrice(produto, porMestre.get(m.id) ?? [], cfg, hoje),
        };
      });
    },
  });
}
