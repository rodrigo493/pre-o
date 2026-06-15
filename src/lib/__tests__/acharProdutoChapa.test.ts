import { describe, it, expect } from "vitest";
import { acharProdutoChapa } from "@/lib/bitolaMatch";

describe("acharProdutoChapa — acha a chapa pela medida, prefere o que tem custo", () => {
  const produtos = [
    { id: "ch", codigo: "CH.LISA.1200X3000X1,2MM", nome: "CHAPA LISA 1200X3000X1,2MM", comCusto: false },
    { id: "cff", codigo: null, nome: "CFF 1,2 X 1200 X 3000-", comCusto: true },
    { id: "outra", codigo: "CH.LISA.1200X3000X2,0MM", nome: "CHAPA LISA 1200X3000X2,0MM", comCusto: true },
  ];

  it("casa 1200×3000×1,2 e prefere o produto com custo (CFF)", () => {
    expect(acharProdutoChapa("CH.LISA.1200X3000X1,2MM", produtos)).toBe("cff");
  });

  it("não confunde com a de 2,0mm (medida diferente)", () => {
    expect(acharProdutoChapa("CH.LISA.1200X3000X2,0MM", produtos)).toBe("outra");
  });

  it("sem candidato → null", () => {
    expect(acharProdutoChapa("CH.LISA.1500X3000X6,30MM", produtos)).toBeNull();
  });
});
