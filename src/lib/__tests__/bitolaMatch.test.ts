import { describe, it, expect } from "vitest";
import { acharProdutoDaBitola } from "@/lib/bitolaMatch";

const produtos = [
  { id: "t1", codigo: "FRM.TRE.12,70MM", nome: "TREFILADO 1/2'' - 1020" },
  { id: "t2", codigo: "FRM.TRE.4,76MM", nome: "TREFILADO 3/16'' - 1020" },
  { id: "tu1", codigo: "RED.76.2X2", nome: "TUBO RED 76.2X2MM X6000" },
  { id: "tu2", codigo: "RET.100X40X2,00", nome: "TUBO RET. 100X40X200 FQ" },
  { id: "pl1", codigo: "PP.097", nome: "TARUGO POLIACETAL PRETO 16X1000" },
  { id: "pl2", codigo: "PP.093", nome: "TARUGO POLIPROPILENO PRETO 20X1000" },
  { id: "x", codigo: "RED.25.4X2", nome: "TUBO RED 25.4X2MM X6000" },
];

describe("acharProdutoDaBitola", () => {
  it("usa produto_mestre_id quando já definido", () => {
    expect(acharProdutoDaBitola({ tipo: "trefilado", nome: "Trefilado 12.7", produto_mestre_id: "fixo" }, produtos)).toBe("fixo");
  });
  it("trefilado pela medida (12.7 → FRM.TRE.12,70MM)", () => {
    expect(acharProdutoDaBitola({ tipo: "trefilado", nome: "Trefilado 12.7", produto_mestre_id: null }, produtos)).toBe("t1");
  });
  it("tubo redondo (76.2x2 → RED.76.2X2)", () => {
    expect(acharProdutoDaBitola({ tipo: "tubo", nome: "Redondo 76.2x2", produto_mestre_id: null }, produtos)).toBe("tu1");
  });
  it("tubo retangular (100x40x2 → RET.100X40X2,00)", () => {
    expect(acharProdutoDaBitola({ tipo: "tubo", nome: "Quadrado 100x40x2", produto_mestre_id: null }, produtos)).toBe("tu2");
  });
  it("plástico pela descrição (16x1000 → PP.097)", () => {
    expect(acharProdutoDaBitola({ tipo: "plastico", nome: "Poliacetal preto 16x1000", produto_mestre_id: null }, produtos)).toBe("pl1");
  });
  it("não casa fora da família (trefilado 25.4 não pega tubo RED.25.4)", () => {
    expect(acharProdutoDaBitola({ tipo: "trefilado", nome: "Trefilado 25.4", produto_mestre_id: null }, produtos)).toBeNull();
  });
});
