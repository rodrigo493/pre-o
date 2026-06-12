import { describe, it, expect } from "vitest";
import { custoExtras, criarCustoDe, type ProdutoCusto } from "@/lib/custoComposto";

function prod(p: Partial<ProdutoCusto> & { id: string }): ProdutoCusto {
  return {
    tipo: "montado", custoManual: null, somaNota: false, tempoCorteMin: null,
    ...p,
  };
}

describe("custoExtras — parcelas de mão de obra e corte laser", () => {
  it("soma_nota com nota na janela → mão de obra = custo da nota", () => {
    const r = custoExtras({ somaNota: true, custoNota: 38.5, tempoCorteMin: null, valorHoraLaser: 120 });
    expect(r.maoDeObra).toBe(38.5);
    expect(r.corteLaser).toBe(0);
    expect(r.maoDeObraPendente).toBe(false);
  });

  it("soma_nota SEM nota na janela → parcela 0 e pendente", () => {
    const r = custoExtras({ somaNota: true, custoNota: null, tempoCorteMin: null, valorHoraLaser: 120 });
    expect(r.maoDeObra).toBe(0);
    expect(r.maoDeObraPendente).toBe(true);
  });

  it("soma_nota desligado → ignora a nota e não fica pendente", () => {
    const r = custoExtras({ somaNota: false, custoNota: 99, tempoCorteMin: null, valorHoraLaser: 0 });
    expect(r.maoDeObra).toBe(0);
    expect(r.maoDeObraPendente).toBe(false);
  });

  it("corte laser = tempo/60 × valor da hora", () => {
    const r = custoExtras({ somaNota: false, custoNota: null, tempoCorteMin: 4.5, valorHoraLaser: 120 });
    expect(r.corteLaser).toBeCloseTo(9, 5); // 4,5/60 × 120
  });

  it("valor_hora_laser = 0 ou tempo null → parcela 0, sem erro", () => {
    expect(custoExtras({ somaNota: false, custoNota: null, tempoCorteMin: 4.5, valorHoraLaser: 0 }).corteLaser).toBe(0);
    expect(custoExtras({ somaNota: false, custoNota: null, tempoCorteMin: null, valorHoraLaser: 120 }).corteLaser).toBe(0);
  });

  it("as duas parcelas coexistem", () => {
    const r = custoExtras({ somaNota: true, custoNota: 10, tempoCorteMin: 30, valorHoraLaser: 100 });
    expect(r.maoDeObra).toBe(10);
    expect(r.corteLaser).toBe(50);
  });
});

describe("criarCustoDe — recursão com extras", () => {
  it("US: componentes (trefilado fração de barra) + mão de obra da nota", () => {
    // trefilado: comprado a 250 R$/barra; ficha usa 0,03 BR; nota do US = 38,50 de mão de obra
    const custoDe = criarCustoDe({
      produtos: new Map([
        ["tre", prod({ id: "tre", tipo: "comprado" })],
        ["us1", prod({ id: "us1", somaNota: true })],
      ]),
      custoCompradoPorId: new Map([["tre", 250]]),
      custoNotaPorId: new Map([["us1", 38.5]]),
      compPorMontado: new Map([["us1", [{ componenteId: "tre", qtd: 0.03 }]]]),
      valorHoraLaser: 0,
    });
    expect(custoDe("us1")).toBeCloseTo(250 * 0.03 + 38.5, 5); // 46,00
  });

  it("TB: componentes + corte laser (tempo × hora)", () => {
    const custoDe = criarCustoDe({
      produtos: new Map([
        ["tubo", prod({ id: "tubo", tipo: "comprado" })],
        ["tb1", prod({ id: "tb1", tempoCorteMin: 6 })],
      ]),
      custoCompradoPorId: new Map([["tubo", 109.62]]),
      custoNotaPorId: new Map(),
      compPorMontado: new Map([["tb1", [{ componenteId: "tubo", qtd: 0.07 }]]]),
      valorHoraLaser: 120,
    });
    expect(custoDe("tb1")).toBeCloseTo(109.62 * 0.07 + (6 / 60) * 120, 5);
  });

  it("montado SEM componentes mas com extras → custo_manual + extras", () => {
    const custoDe = criarCustoDe({
      produtos: new Map([["us1", prod({ id: "us1", somaNota: true, custoManual: 5 })]]),
      custoCompradoPorId: new Map(),
      custoNotaPorId: new Map([["us1", 38.5]]),
      compPorMontado: new Map(),
      valorHoraLaser: 0,
    });
    expect(custoDe("us1")).toBeCloseTo(43.5, 5);
  });

  it("peça US dentro de um aparelho propaga o custo completo (recursão)", () => {
    const custoDe = criarCustoDe({
      produtos: new Map([
        ["tre", prod({ id: "tre", tipo: "comprado" })],
        ["us1", prod({ id: "us1", somaNota: true })],
        ["apar", prod({ id: "apar" })],
      ]),
      custoCompradoPorId: new Map([["tre", 250]]),
      custoNotaPorId: new Map([["us1", 38.5]]),
      compPorMontado: new Map([
        ["us1", [{ componenteId: "tre", qtd: 0.03 }]],
        ["apar", [{ componenteId: "us1", qtd: 2 }]],
      ]),
      valorHoraLaser: 0,
    });
    expect(custoDe("apar")).toBeCloseTo(2 * (250 * 0.03 + 38.5), 5); // 92,00
  });

  it("ciclo na composição não trava nem duplica extras", () => {
    const custoDe = criarCustoDe({
      produtos: new Map([
        ["a", prod({ id: "a", somaNota: true })],
        ["b", prod({ id: "b" })],
      ]),
      custoCompradoPorId: new Map(),
      custoNotaPorId: new Map([["a", 10]]),
      compPorMontado: new Map([
        ["a", [{ componenteId: "b", qtd: 1 }]],
        ["b", [{ componenteId: "a", qtd: 1 }]],
      ]),
      valorHoraLaser: 0,
    });
    expect(custoDe("a")).toBe(10); // b→a em ciclo vale 0; extras de a somados uma vez
  });

  it("comprado retorna o custo da nota; id desconhecido retorna 0", () => {
    const custoDe = criarCustoDe({
      produtos: new Map([["c1", prod({ id: "c1", tipo: "comprado" })]]),
      custoCompradoPorId: new Map([["c1", 12.3]]),
      custoNotaPorId: new Map(),
      compPorMontado: new Map(),
      valorHoraLaser: 0,
    });
    expect(custoDe("c1")).toBe(12.3);
    expect(custoDe("nao-existe")).toBe(0);
  });
});
