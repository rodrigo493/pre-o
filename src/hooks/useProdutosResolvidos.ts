import { useQuery } from "@tanstack/react-query";
import { listProdutosMestre } from "@/repositories/produtosMestreRepo";
import { listItensComData } from "@/repositories/itensNotaRepo";
import { listComponentes } from "@/repositories/componentesMontadoRepo";
import { listVinculos } from "@/repositories/vinculosRepo";
import { getConfig } from "@/repositories/configRepo";
import {
  resolvePrice,
  resolveCustoNota,
  type ItemNota,
  type ProdutoMestre,
  type ResolvedPrice,
} from "@/lib/priceResolution";
import { criarCustoDe, custoExtras, type ProdutoCusto } from "@/lib/custoComposto";

export interface LinhaProduto extends ProdutoMestre {
  resolvido: ResolvedPrice;
  maisVendido: boolean;
  temVinculo: boolean;
  /** Decomposição do custo do montado (0 quando não se aplica). */
  custoMaoDeObra: number;
  custoCorteLaser: number;
  /** soma_nota ligado mas sem nota do código nos últimos 3 meses. */
  maoDeObraPendente: boolean;
  /** Maior custo da nota do PRÓPRIO código (montados; null = sem nota na janela). */
  custoNotaProprio: number | null;
}

export function useProdutosResolvidos() {
  return useQuery({
    queryKey: ["produtos-resolvidos"],
    queryFn: async (): Promise<LinhaProduto[]> => {
      const [mestres, itens, cfg, componentes, vinculos] = await Promise.all([
        listProdutosMestre(), listItensComData(), getConfig(), listComponentes(), listVinculos(),
      ]);
      const hoje = new Date();
      // Fator de conversão por cProd (vínculo): custo_real = custo / fator.
      const fatorPorCprod = new Map<string, number>();
      for (const v of vinculos) {
        if (v.fatorConversao != null && v.fatorConversao > 0) {
          fatorPorCprod.set(v.cprod.trim().toUpperCase(), v.fatorConversao);
        }
      }
      const porMestre = new Map<string, ItemNota[]>();
      for (const it of itens) {
        if (!it.produto_mestre_id) continue;
        const arr = porMestre.get(it.produto_mestre_id) ?? [];
        arr.push({ id: it.id, custoUnitario: Number(it.custo_unitario), dataEmissao: it.data_emissao, notaId: it.nota_id, notaNumero: it.nota_numero ?? undefined, unidade: it.unidade, fatorConversao: fatorPorCprod.get(it.cprod.trim().toUpperCase()) });
        porMestre.set(it.produto_mestre_id, arr);
      }

      const base = (m: typeof mestres[number]): ProdutoMestre => ({
        id: m.id, nome: m.nome, categoria: m.categoria, tipo: m.tipo,
        custoManual: m.custo_manual, precoManual: m.preco_manual, codigo: m.codigo,
        unidade: m.unidade, unidadeSecundaria: m.unidade_secundaria, fatorConversao: m.fator_conversao,
        conversaoOp: m.conversao_op,
        somaNota: m.soma_nota ?? false,
        tempoCorteMin: m.tempo_corte_min,
      });

      // Custo de matéria-prima (comprado) = maior custo das notas (sem componentes).
      const custoCompradoPorId = new Map<string, number | null>();
      // Custo da nota do PRÓPRIO código dos montados (mão de obra dos US).
      const custoNotaPorId = new Map<string, number | null>();
      for (const m of mestres) {
        const itensM = porMestre.get(m.id) ?? [];
        if (m.tipo !== "montado") {
          const r = resolvePrice(base(m), itensM, cfg, hoje);
          custoCompradoPorId.set(m.id, r.custoBase);
        } else {
          custoNotaPorId.set(m.id, itensM.length > 0 ? resolveCustoNota(base(m), itensM, hoje).custo : null);
        }
      }

      // Componentes agrupados por montado.
      const compPorMontado = new Map<string, Array<{ componenteId: string; qtd: number }>>();
      for (const c of componentes) {
        const arr = compPorMontado.get(c.montado_id) ?? [];
        arr.push({ componenteId: c.componente_id, qtd: Number(c.quantidade) });
        compPorMontado.set(c.montado_id, arr);
      }

      // Custo recursivo com extras (mão de obra da nota + corte laser) dentro da recursão.
      const produtosCusto = new Map<string, ProdutoCusto>(
        mestres.map((m) => [m.id, {
          id: m.id,
          tipo: m.tipo,
          custoManual: m.custo_manual != null ? Number(m.custo_manual) : null,
          somaNota: m.soma_nota ?? false,
          tempoCorteMin: m.tempo_corte_min != null ? Number(m.tempo_corte_min) : null,
        }]),
      );
      const custoDe = criarCustoDe({
        produtos: produtosCusto,
        custoCompradoPorId,
        custoNotaPorId,
        compPorMontado,
        valorHoraLaser: cfg.valorHoraLaser,
      });

      return mestres.map((m) => {
        const produto = base(m);
        let custoMaoDeObra = 0;
        let custoCorteLaser = 0;
        let maoDeObraPendente = false;
        if (m.tipo === "montado") {
          const extras = custoExtras({
            somaNota: m.soma_nota ?? false,
            custoNota: custoNotaPorId.get(m.id) ?? null,
            tempoCorteMin: m.tempo_corte_min != null ? Number(m.tempo_corte_min) : null,
            valorHoraLaser: cfg.valorHoraLaser,
          });
          custoMaoDeObra = extras.maoDeObra;
          custoCorteLaser = extras.corteLaser;
          maoDeObraPendente = extras.maoDeObraPendente;
          const temComps = (compPorMontado.get(m.id)?.length ?? 0) > 0;
          if (temComps || extras.maoDeObra > 0 || extras.corteLaser > 0) {
            produto.custoComponentes = custoDe(m.id);
          }
        }
        return {
          ...produto,
          maisVendido: m.mais_vendido ?? false,
          temVinculo: (porMestre.get(m.id)?.length ?? 0) > 0,
          custoMaoDeObra,
          custoCorteLaser,
          maoDeObraPendente,
          custoNotaProprio: m.tipo === "montado" ? custoNotaPorId.get(m.id) ?? null : null,
          resolvido: resolvePrice(produto, porMestre.get(m.id) ?? [], cfg, hoje),
        };
      });
    },
  });
}
