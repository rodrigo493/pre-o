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
import { listConfigChapas } from "@/repositories/configChapasRepo";
import { listPecasLaser } from "@/repositories/pecasLaserRepo";
import { calcularCustoPecaLaser } from "@/lib/laserCost";
import { listConfigBitolas, listPecasUsinado, listPecasTubo } from "@/repositories/bitolasRepo";
import { calcularCustoPecaUsinada } from "@/lib/usinadoCost";
import { calcularCustoPecaTubo } from "@/lib/tuboCost";
import { calculateSellingPrice } from "@/lib/pricing";

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
      // Tolerância pré-migration 0011: se as tabelas ainda não existem, degrada para vazio
      // (não quebra Produtos/montado, que também usam este hook).
      const [chapas, pecasLaser, bitolas, pecasUsinado, pecasTubo] = await Promise.all([
        listConfigChapas().catch(() => []),
        listPecasLaser().catch(() => []),
        listConfigBitolas().catch(() => []),
        listPecasUsinado().catch(() => []),
        listPecasTubo().catch(() => []),
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

      // Peças LA (chapa laser): custo = material da chapa (valor da chapa por unidade × % da peça)
      // + corte laser. Sobrescreve o custo do comprado (a recursão de montados lê este mapa) E
      // alimenta o custo próprio da peça (para aparecer em Produtos).
      const custoLaserPorId = new Map<string, number>();
      if (pecasLaser.length > 0) {
        const idPorCodigo = new Map<string, string>();
        const mestrePorId = new Map(mestres.map((m) => [m.id, m]));
        for (const m of mestres) if (m.codigo) idPorCodigo.set(m.codigo.trim().toUpperCase(), m.id);
        const chapaPorEspessura = new Map(chapas.map((c) => [Number(c.espessura), c]));
        for (const peca of pecasLaser) {
          const chapa = chapaPorEspessura.get(Number(peca.espessura));
          if (!chapa) continue;
          // Chapa: produto configurado tem precedência sobre o código (cobre produto sem código).
          const chapaId = chapa.produto_mestre_id ?? idPorCodigo.get(chapa.chapa_codigo.trim().toUpperCase());
          // Recupera o R$/kg (desfaz um fator × se houver) e multiplica pelo peso da config.
          // Robusto: funciona com a chapa em R$/kg OU já por unidade (fator × peso).
          const baseChapa = (chapaId ? custoCompradoPorId.get(chapaId) : null) ?? 0;
          const cm = chapaId ? mestrePorId.get(chapaId) : undefined;
          const fator = cm?.fator_conversao != null ? Number(cm.fator_conversao) : null;
          const rkgChapa = cm?.conversao_op === "multiplicar" && fator && fator > 0 ? baseChapa / fator : baseChapa;
          const valorChapaUnit = rkgChapa * Number(chapa.peso_kg);
          const r = calcularCustoPecaLaser({
            larguraMm: Number(peca.largura_mm),
            comprimentoMm: Number(peca.comprimento_mm),
            tempoSeg: Number(peca.tempo_corte_seg),
            areaChapaMm2: Number(chapa.area_mm2),
            valorChapaUnit,
            valorHoraLaser: cfg.valorHoraLaser,
          });
          custoCompradoPorId.set(peca.produto_mestre_id, r.custoUnitario);
          custoLaserPorId.set(peca.produto_mestre_id, r.custoUnitario);
        }
      }

      // Peças USINADAS: trefilado (R$/kg × peso barra) + plástico (R$/un barra) + mão de obra.
      if (pecasUsinado.length > 0) {
        const mestrePorId = new Map(mestres.map((m) => [m.id, m]));
        const bitolaPorId = new Map(bitolas.map((b) => [b.id, b]));
        const rkgDe = (produtoId: string | null): number => {
          if (!produtoId) return 0;
          const base = custoCompradoPorId.get(produtoId) ?? 0;
          const m = mestrePorId.get(produtoId);
          const fator = m?.fator_conversao != null ? Number(m.fator_conversao) : null;
          return m?.conversao_op === "multiplicar" && fator && fator > 0 ? base / fator : base;
        };
        for (const peca of pecasUsinado) {
          const tref = peca.bitola_trefilado_id ? bitolaPorId.get(peca.bitola_trefilado_id) : null;
          const plast = peca.bitola_plastico_id ? bitolaPorId.get(peca.bitola_plastico_id) : null;
          const r = calcularCustoPecaUsinada({
            comprimentoMm: Number(peca.comprimento_mm),
            maoDeObra: Number(peca.mao_de_obra),
            trefilado: tref
              ? {
                  rkg: rkgDe(tref.produto_mestre_id),
                  pesoBarraKg: Number(tref.peso_barra_kg ?? 0),
                  comprimentoBarraMm: Number(tref.comprimento_barra_mm),
                }
              : null,
            plastico: plast
              ? {
                  valorBarra: plast.produto_mestre_id ? custoCompradoPorId.get(plast.produto_mestre_id) ?? 0 : 0,
                  comprimentoBarraMm: Number(plast.comprimento_barra_mm),
                }
              : null,
          });
          custoCompradoPorId.set(peca.produto_mestre_id, r.custoUnitario);
          custoLaserPorId.set(peca.produto_mestre_id, r.custoUnitario);
        }
      }

      // Peças de TUBO: material da barra (comprimento/barra × R$/kg × peso) + corte a laser.
      if (pecasTubo.length > 0) {
        const mestrePorId = new Map(mestres.map((m) => [m.id, m]));
        const bitolaPorId = new Map(bitolas.map((b) => [b.id, b]));
        const rkgDe = (produtoId: string | null): number => {
          if (!produtoId) return 0;
          const base = custoCompradoPorId.get(produtoId) ?? 0;
          const m = mestrePorId.get(produtoId);
          const fator = m?.fator_conversao != null ? Number(m.fator_conversao) : null;
          return m?.conversao_op === "multiplicar" && fator && fator > 0 ? base / fator : base;
        };
        for (const peca of pecasTubo) {
          const bit = peca.bitola_id ? bitolaPorId.get(peca.bitola_id) : null;
          const r = calcularCustoPecaTubo({
            comprimentoMm: Number(peca.comprimento_mm),
            tempoSeg: Number(peca.tempo_corte_seg),
            valorHoraLaser: cfg.valorHoraLaser,
            tubo: bit
              ? {
                  rkg: rkgDe(bit.produto_mestre_id),
                  pesoBarraKg: Number(bit.peso_barra_kg ?? 0),
                  comprimentoBarraMm: Number(bit.comprimento_barra_mm),
                }
              : null,
          });
          custoCompradoPorId.set(peca.produto_mestre_id, r.custoUnitario);
          custoLaserPorId.set(peca.produto_mestre_id, r.custoUnitario);
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
        custoLaserPorId,
      });

      return mestres.map((m) => {
        const produto = base(m);

        // Peça LA com receita de laser: custo = valor calculado; preço = markup sobre ele.
        // Vale para qualquer tipo (peças LA vêm como "montado" pelo prefixo do código).
        const custoLaser = custoLaserPorId.get(m.id);
        if (custoLaser != null) {
          const preco = custoLaser > 0 ? calculateSellingPrice(custoLaser, cfg, 0).precoComIPI : null;
          return {
            ...produto,
            maisVendido: m.mais_vendido ?? false,
            // Peça LA precificada está conectada (via a chapa) → conta como vinculada.
            temVinculo: custoLaser > 0 || (porMestre.get(m.id)?.length ?? 0) > 0,
            custoMaoDeObra: 0,
            custoCorteLaser: 0,
            maoDeObraPendente: false,
            custoNotaProprio: null,
            resolvido: {
              precoVenda: preco,
              custoBase: custoLaser,
              margemPercent: preco && preco > 0 ? ((preco - custoLaser) / preco) * 100 : null,
              status: custoLaser > 0 ? "ok" : "sem_custo_recente",
              origem: null,
              numNotasPeriodo: 0,
              conversaoPendente: false,
            },
          };
        }

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
