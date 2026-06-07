import { subMonths, parseISO, startOfDay } from "date-fns";
import { calculateSellingPrice, type PricingPercentages } from "@/lib/pricing";

export type ProdutoTipo = "comprado" | "montado";
export type PriceStatus = "ok" | "travado" | "sem_custo_recente" | "sem_preco_manual";

export interface ItemNota {
  id: string;
  custoUnitario: number;
  dataEmissao: string;   // ISO yyyy-mm-dd (nota.data_emissao)
  notaId: string;
  notaNumero?: string;
}

export interface ProdutoMestre {
  id: string;
  nome: string;
  categoria?: string | null;
  tipo: ProdutoTipo;
  custoManual?: number | null;
  precoManual?: number | null;
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

export function resolvePrice(
  produto: ProdutoMestre,
  itens: ItemNota[],
  config: PricingPercentages,
  frete: number,
  hoje: Date,
): ResolvedPrice {
  const recentes = itensNaJanela(itens, hoje);
  const maior = recentes.reduce<ItemNota | null>(
    (acc, it) => (acc == null || it.custoUnitario > acc.custoUnitario ? it : acc),
    null,
  );
  const custoComprado = maior?.custoUnitario ?? null;
  const origem: PriceOrigem | null = maior
    ? { notaId: maior.notaId, notaNumero: maior.notaNumero, dataEmissao: maior.dataEmissao }
    : null;

  // 1. Override manual (qualquer tipo)
  if (produto.precoManual != null) {
    const custoBase = produto.tipo === "montado" ? produto.custoManual ?? null : custoComprado;
    return {
      precoVenda: produto.precoManual,
      custoBase,
      margemPercent: margem(produto.precoManual, custoBase),
      status: "travado",
      origem: produto.tipo === "montado" ? null : origem,
      numNotasPeriodo: recentes.length,
    };
  }

  // 2. Montado sem override: preço manual é obrigatório; sem ele → sem_preco_manual
  if (produto.tipo === "montado") {
    return {
      precoVenda: null,
      custoBase: produto.custoManual ?? null,
      margemPercent: null,
      status: "sem_preco_manual",
      origem: null,
      numNotasPeriodo: 0,
    };
  }

  // 3. Comprado: markup sobre o maior custo dos 3 meses
  if (custoComprado == null) {
    return {
      precoVenda: null, custoBase: null, margemPercent: null,
      status: "sem_custo_recente", origem: null, numNotasPeriodo: 0,
    };
  }
  const preco = calculateSellingPrice(custoComprado, config, frete).precoVenda;
  return {
    precoVenda: preco,
    custoBase: custoComprado,
    margemPercent: margem(preco, custoComprado),
    status: "ok",
    origem,
    numNotasPeriodo: recentes.length,
  };
}
