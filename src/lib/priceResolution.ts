import { subMonths, parseISO, startOfDay } from "date-fns";
import { calculateSellingPrice, type PricingPercentages } from "@/lib/pricing";

export type ProdutoTipo = "comprado" | "montado";
export type ConversaoOp = "dividir" | "multiplicar";
export type PriceStatus = "ok" | "travado" | "sem_custo_recente" | "sem_preco_manual";

export interface ItemNota {
  id: string;
  custoUnitario: number;
  dataEmissao: string;   // ISO yyyy-mm-dd (nota.data_emissao)
  notaId: string;
  notaNumero?: string;
  unidade?: string | null; // unidade da nota (para conversão)
  fatorConversao?: number | null; // fator do vínculo (cProd): custo_real = custo / fator
}

export interface ProdutoMestre {
  id: string;
  nome: string;
  categoria?: string | null;
  tipo: ProdutoTipo;
  custoManual?: number | null;
  precoManual?: number | null;
  codigo?: string | null;
  unidade?: string | null;
  unidadeSecundaria?: string | null;
  fatorConversao?: number | null;
  /** Operação da conversão do custo da nota: dividir (cento→un) ou multiplicar (kg→peça). */
  conversaoOp?: ConversaoOp | null;
  /** Custo total dos componentes (montado): soma de custo×qtd. null = sem composição. */
  custoComponentes?: number | null;
}

export interface PriceOrigem {
  notaId: string;
  notaNumero?: string;
  dataEmissao: string;
}

export interface ResolvedPrice {
  precoVenda: number | null;
  custoBase: number | null;      // maiorCusto (comprado) ou custoManual (montado)
  margemPercent: number | null;  // (preco - custo) / preco * 100
  status: PriceStatus;
  origem: PriceOrigem | null;
  numNotasPeriodo: number;
  conversaoPendente: boolean;    // item em unidade divergente sem fator definido
}

function margem(preco: number | null, custo: number | null): number | null {
  if (preco == null || custo == null || preco <= 0) return null;
  return ((preco - custo) / preco) * 100;
}

/**
 * Itens dentro da janela móvel dos últimos 3 meses (limite inclusivo).
 * Compara por dia (start-of-day) para que a regra "exatamente 3 meses atrás"
 * seja inclusiva independente da hora/fuso de `hoje`.
 */
function itensNaJanela(itens: ItemNota[], hoje: Date): ItemNota[] {
  const limite = startOfDay(subMonths(startOfDay(hoje), 3));
  return itens.filter((it) => startOfDay(parseISO(it.dataEmissao)) >= limite);
}

export interface CustoNotaResult {
  custo: number | null;
  origem: PriceOrigem | null;
  numNotas: number;
}

/**
 * Maior custo unitário da nota na janela móvel de 3 meses, convertido para a
 * unidade do produto. Prioridade: fator do vínculo (cProd, sempre divide) →
 * fator do produto (op ÷/×). Usado pelo comprado (resolvePrice) e pela parcela
 * de mão de obra dos montados com soma_nota.
 */
export function resolveCustoNota(
  produto: ProdutoMestre,
  itens: ItemNota[],
  hoje: Date,
): CustoNotaResult {
  const recentes = itensNaJanela(itens, hoje);
  const convertidos = recentes.map((it) => {
    let custo = it.custoUnitario;
    if (it.fatorConversao != null && it.fatorConversao > 0) {
      custo = it.custoUnitario / it.fatorConversao;
    } else if (produto.fatorConversao != null && produto.fatorConversao > 0) {
      custo =
        produto.conversaoOp === "dividir"
          ? it.custoUnitario / produto.fatorConversao
          : it.custoUnitario * produto.fatorConversao;
    }
    return { item: it, custo };
  });
  const maior = convertidos.reduce<{ item: ItemNota; custo: number } | null>(
    (acc, c) => (acc == null || c.custo > acc.custo ? c : acc),
    null,
  );
  return {
    custo: maior?.custo ?? null,
    origem: maior
      ? { notaId: maior.item.notaId, notaNumero: maior.item.notaNumero, dataEmissao: maior.item.dataEmissao }
      : null,
    numNotas: recentes.length,
  };
}

export function resolvePrice(
  produto: ProdutoMestre,
  itens: ItemNota[],
  config: PricingPercentages,
  hoje: Date,
): ResolvedPrice {
  // Converte o custo de cada item da nota para a unidade do produto.
  // Prioridade: fator do vínculo (cProd, sempre divide) → fator do produto (op ÷/×).
  // O fator do produto é aplicado SEMPRE que definido (não depende do texto da unidade).
  const conversaoPendente = false;
  const { custo: custoComprado, origem, numNotas } = resolveCustoNota(produto, itens, hoje);

  // Custo do montado = soma dos componentes (se houver composição); senão custo manual.
  const custoMontado =
    produto.tipo === "montado"
      ? produto.custoComponentes != null
        ? produto.custoComponentes
        : produto.custoManual ?? null
      : null;

  // 1. Override manual (qualquer tipo)
  if (produto.precoManual != null) {
    const custoBase = produto.tipo === "montado" ? custoMontado : custoComprado;
    return {
      precoVenda: produto.precoManual,
      custoBase,
      margemPercent: margem(produto.precoManual, custoBase),
      status: "travado",
      origem: produto.tipo === "montado" ? null : origem,
      numNotasPeriodo: numNotas,
      conversaoPendente: produto.tipo === "montado" ? false : conversaoPendente,
    };
  }

  // 2. Montado: preço calculado pela composição (custo dos componentes + markup).
  if (produto.tipo === "montado") {
    if (custoMontado != null && custoMontado > 0) {
      const preco = calculateSellingPrice(custoMontado, config, 0).precoComIPI;
      return {
        precoVenda: preco,
        custoBase: custoMontado,
        margemPercent: margem(preco, custoMontado),
        status: "ok",
        origem: null,
        numNotasPeriodo: 0,
        conversaoPendente: false,
      };
    }
    // Sem composição e sem preço manual → falta definir.
    return {
      precoVenda: null,
      custoBase: custoMontado,
      margemPercent: null,
      status: "sem_preco_manual",
      origem: null,
      numNotasPeriodo: 0,
      conversaoPendente: false,
    };
  }

  // 3. Comprado: markup sobre o maior custo dos 3 meses
  if (custoComprado == null) {
    return {
      precoVenda: null, custoBase: null, margemPercent: null,
      status: "sem_custo_recente", origem: null, numNotasPeriodo: 0,
      conversaoPendente,
    };
  }
  // preço cheio = base + IPI
  const preco = calculateSellingPrice(custoComprado, config, 0).precoComIPI;
  return {
    precoVenda: preco,
    custoBase: custoComprado,
    margemPercent: margem(preco, custoComprado),
    status: "ok",
    origem,
    numNotasPeriodo: numNotas,
    conversaoPendente,
  };
}
