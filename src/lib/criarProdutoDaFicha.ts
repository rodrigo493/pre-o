import type { ComposicaoItem } from "@/lib/composicaoParser";
import { findOrCreateMontadoByCodigo } from "@/repositories/produtosMestreRepo";
import { clearComponentes, insertComponentes } from "@/repositories/componentesMontadoRepo";

export interface CatalogoRef {
  id: string;
  codigo: string | null;
}

export interface ComponenteCasado {
  componenteId: string;
  quantidade: number;
  codigo: string;
}

export interface CasamentoResult {
  encontrados: ComponenteCasado[];
  naoEncontrados: ComposicaoItem[];
}

/** Casa itens da ficha com o catálogo pelo código normalizado (UPPER/trim). Pura. */
export function casarNoCatalogo(
  itens: ComposicaoItem[],
  catalogo: CatalogoRef[],
): CasamentoResult {
  const idPorCodigo = new Map<string, string>();
  for (const p of catalogo) {
    if (p.codigo) idPorCodigo.set(p.codigo.trim().toUpperCase(), p.id);
  }
  const encontrados: ComponenteCasado[] = [];
  const naoEncontrados: ComposicaoItem[] = [];
  for (const it of itens) {
    const id = idPorCodigo.get(it.codigo.trim().toUpperCase());
    if (id) encontrados.push({ componenteId: id, quantidade: it.quantidade, codigo: it.codigo });
    else naoEncontrados.push(it);
  }
  return { encontrados, naoEncontrados };
}

export interface CriarProdutoDaFichaInput {
  codigo: string;
  nome: string;
  categoria: string | null;
  componentes: Array<{ componenteId: string; quantidade: number }>;
}

export interface CriarProdutoDaFichaResult {
  montadoId: string;
  vinculados: number;
}

/**
 * Find-or-create do montado pelo código + regrava a composição (SUBSTITUI a
 * anterior). Custo/preço NÃO são calculados aqui: o useProdutosResolvidos já
 * soma os componentes e aplica o markup — o produto aparece precificado em
 * Produtos sem código novo de cálculo.
 */
export async function criarProdutoDaFicha(
  input: CriarProdutoDaFichaInput,
): Promise<CriarProdutoDaFichaResult> {
  const montadoId = await findOrCreateMontadoByCodigo({
    codigo: input.codigo,
    nome: input.nome,
    categoria: input.categoria,
  });
  // Auto-referência (componente casado no próprio montado) criaria ciclo.
  const componentes = input.componentes.filter((c) => c.componenteId !== montadoId);
  await clearComponentes(montadoId);
  if (componentes.length > 0) await insertComponentes(montadoId, componentes);
  return { montadoId, vinculados: componentes.length };
}
