export type ConversaoOp = "dividir" | "multiplicar" | null;

/**
 * R$/kg "cru" do item — o preço por kg que vem da nota, desfazendo qualquer fator
 * de conversão que esteja gravado no produto (× ou ÷).
 *
 * Modelo do sistema (chapa/tubo/trefilado): o item vinculado traz o R$/kg da nota;
 * o valor da chapa/barra = R$/kg × peso. Nenhum desses materiais usa fator — mas se
 * um fator espúrio existir no produto, esta função o desfaz para recuperar o R$/kg real.
 *
 * - sem fator           → custoBase (já é o R$/kg)
 * - fator "multiplicar" → custoBase ÷ fator (custoBase = R$/kg × fator)
 * - fator "dividir"     → custoBase × fator (custoBase = R$/kg ÷ fator)
 */
export function rkgCru(custoBase: number, fator: number | null, op: ConversaoOp): number {
  if (!fator || fator <= 0) return custoBase;
  return op === "multiplicar" ? custoBase / fator : custoBase * fator;
}
