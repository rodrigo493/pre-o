import { describe, it, expect } from "vitest";
import { resolvePrice, type ItemNota, type ProdutoMestre } from "@/lib/priceResolution";
import { defaultPercentages, calculateSellingPrice } from "@/lib/pricing";

const HOJE = new Date("2026-06-06T12:00:00-03:00");
const cfg = defaultPercentages;

function item(custo: number, data: string, id = "i" + custo, notaId = "n" + custo): ItemNota {
  return { id, custoUnitario: custo, dataEmissao: data, notaId, notaNumero: notaId };
}

describe("resolvePrice — comprado (regra dos 3 meses)", () => {
  it("usa o MAIOR custo dentro dos últimos 3 meses", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado" };
    const itens = [
      item(10, "2026-05-01"), // dentro
      item(15, "2026-04-10"), // dentro, maior
      item(99, "2026-01-01"), // FORA da janela (ignorar)
    ];
    const r = resolvePrice(produto, itens, cfg, 0, HOJE);
    expect(r.status).toBe("ok");
    expect(r.custoBase).toBe(15);
    const esperado = calculateSellingPrice(15, cfg, 0).precoVenda;
    expect(r.precoVenda).toBeCloseTo(esperado, 2);
    expect(r.numNotasPeriodo).toBe(2);
    expect(r.origem?.dataEmissao).toBe("2026-04-10");
  });

  it("sem item nos últimos 3 meses e sem preço manual → sem_custo_recente", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado" };
    const r = resolvePrice(produto, [item(99, "2026-01-01")], cfg, 0, HOJE);
    expect(r.status).toBe("sem_custo_recente");
    expect(r.precoVenda).toBeNull();
    expect(r.numNotasPeriodo).toBe(0);
  });

  it("inclui item exatamente no limite de 3 meses atrás", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado" };
    // 3 meses antes de 2026-06-06 = 2026-03-06
    const r = resolvePrice(produto, [item(20, "2026-03-06")], cfg, 0, HOJE);
    expect(r.status).toBe("ok");
    expect(r.custoBase).toBe(20);
  });

  it("lista de itens vazia → sem_custo_recente, preço null", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado" };
    const r = resolvePrice(produto, [], cfg, 0, HOJE);
    expect(r.status).toBe("sem_custo_recente");
    expect(r.precoVenda).toBeNull();
    expect(r.custoBase).toBeNull();
    expect(r.numNotasPeriodo).toBe(0);
    expect(r.origem).toBeNull();
  });
});

describe("resolvePrice — override manual", () => {
  it("preço manual vence o markup em produto comprado", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado", precoManual: 500 };
    const r = resolvePrice(produto, [item(15, "2026-05-01")], cfg, 0, HOJE);
    expect(r.status).toBe("travado");
    expect(r.precoVenda).toBe(500);
    expect(r.custoBase).toBe(15); // ainda mostra o maior custo p/ margem
  });

  it("override em comprado sem custo recente → travado, custoBase null, margem null", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado", precoManual: 500 };
    const r = resolvePrice(produto, [item(99, "2026-01-01")], cfg, 0, HOJE);
    expect(r.status).toBe("travado");
    expect(r.precoVenda).toBe(500);
    expect(r.custoBase).toBeNull(); // nenhum item na janela
    expect(r.margemPercent).toBeNull();
    expect(r.origem).toBeNull();
    expect(r.numNotasPeriodo).toBe(0);
  });
});

describe("resolvePrice — montado", () => {
  it("usa preço manual e calcula margem contra custo manual", () => {
    const produto: ProdutoMestre = {
      id: "p1", nome: "Reformer", tipo: "montado", custoManual: 1000, precoManual: 2500,
    };
    const r = resolvePrice(produto, [], cfg, 0, HOJE);
    expect(r.precoVenda).toBe(2500);
    expect(r.custoBase).toBe(1000);
    // margem sobre preço = (2500-1000)/2500 = 60%
    expect(r.margemPercent).toBeCloseTo(60, 4);
  });
});
