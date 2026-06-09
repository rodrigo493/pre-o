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
    const r = resolvePrice(produto, itens, cfg, HOJE);
    expect(r.status).toBe("ok");
    expect(r.custoBase).toBe(15);
    const esperado = calculateSellingPrice(15, cfg).precoComIPI;
    expect(r.precoVenda).toBeCloseTo(esperado, 2);
    expect(r.numNotasPeriodo).toBe(2);
    expect(r.origem?.dataEmissao).toBe("2026-04-10");
  });

  it("IPI está embutido no preço de venda (all-in > base)", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado" };
    const itens = [item(100, "2026-05-01")]; // dentro da janela
    const r = resolvePrice(produto, itens, cfg, HOJE);
    expect(r.status).toBe("ok");

    // cfg.ipi = 5.2 → all-in (precoComIPI) deve ser maior que a base (precoVenda)
    const base = calculateSellingPrice(100, cfg).precoVenda;
    expect(cfg.ipi).toBeGreaterThan(0);
    expect(r.precoVenda!).toBeGreaterThan(base);
  });

  it("sem item nos últimos 3 meses e sem preço manual → sem_custo_recente", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado" };
    const r = resolvePrice(produto, [item(99, "2026-01-01")], cfg, HOJE);
    expect(r.status).toBe("sem_custo_recente");
    expect(r.precoVenda).toBeNull();
    expect(r.numNotasPeriodo).toBe(0);
  });

  it("inclui item exatamente no limite de 3 meses atrás", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado" };
    // 3 meses antes de 2026-06-06 = 2026-03-06
    const r = resolvePrice(produto, [item(20, "2026-03-06")], cfg, HOJE);
    expect(r.status).toBe("ok");
    expect(r.custoBase).toBe(20);
  });

  it("lista de itens vazia → sem_custo_recente, preço null", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado" };
    const r = resolvePrice(produto, [], cfg, HOJE);
    expect(r.status).toBe("sem_custo_recente");
    expect(r.precoVenda).toBeNull();
    expect(r.custoBase).toBeNull();
    expect(r.numNotasPeriodo).toBe(0);
    expect(r.origem).toBeNull();
  });
});

describe("resolvePrice — conversão de unidade", () => {
  const chapa: ProdutoMestre = {
    id: "p1", nome: "Chapa", tipo: "comprado",
    unidade: "UNIDADE", unidadeSecundaria: "QUILOGRAMA", fatorConversao: 47.1,
  };

  it("converte custo da nota (kg) para a unidade principal (peça)", () => {
    const itemKg: ItemNota = {
      id: "i1", custoUnitario: 8.5, dataEmissao: "2026-05-01", notaId: "n1", unidade: "QUILOGRAMA",
    };
    const r = resolvePrice(chapa, [itemKg], cfg, HOJE);
    expect(r.status).toBe("ok");
    expect(r.custoBase).toBeCloseTo(400.35, 2); // 8.5 × 47.1
    expect(r.conversaoPendente).toBe(false);
  });

  it("marca conversaoPendente quando falta o fator", () => {
    const semFator: ProdutoMestre = { ...chapa, fatorConversao: null };
    const itemKg: ItemNota = {
      id: "i1", custoUnitario: 8.5, dataEmissao: "2026-05-01", notaId: "n1", unidade: "QUILOGRAMA",
    };
    const r = resolvePrice(semFator, [itemKg], cfg, HOJE);
    expect(r.conversaoPendente).toBe(true);
    expect(r.custoBase).toBe(8.5); // usa custo cru
  });

  it("compara o maior custo já convertido", () => {
    const itens: ItemNota[] = [
      { id: "i1", custoUnitario: 300, dataEmissao: "2026-05-01", notaId: "n1", unidade: "UNIDADE" },
      { id: "i2", custoUnitario: 8.5, dataEmissao: "2026-05-02", notaId: "n2", unidade: "QUILOGRAMA" }, // 400.35 convertido
    ];
    const r = resolvePrice(chapa, itens, cfg, HOJE);
    expect(r.custoBase).toBeCloseTo(400.35, 2);
    expect(r.origem?.notaId).toBe("n2");
  });
});

describe("resolvePrice — override manual", () => {
  it("preço manual vence o markup em produto comprado", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado", precoManual: 500 };
    const r = resolvePrice(produto, [item(15, "2026-05-01")], cfg, HOJE);
    expect(r.status).toBe("travado");
    expect(r.precoVenda).toBe(500);
    expect(r.custoBase).toBe(15); // ainda mostra o maior custo p/ margem
  });

  it("override em comprado sem custo recente → travado, custoBase null, margem null", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado", precoManual: 500 };
    const r = resolvePrice(produto, [item(99, "2026-01-01")], cfg, HOJE);
    expect(r.status).toBe("travado");
    expect(r.precoVenda).toBe(500);
    expect(r.custoBase).toBeNull(); // nenhum item na janela
    expect(r.margemPercent).toBeNull();
    expect(r.origem).toBeNull();
    expect(r.numNotasPeriodo).toBe(0);
  });
});

describe("resolvePrice — montado por composição", () => {
  it("calcula preço a partir do custo dos componentes + markup", () => {
    const produto: ProdutoMestre = {
      id: "p1", nome: "Combo", tipo: "montado", custoComponentes: 1000,
    };
    const r = resolvePrice(produto, [], cfg, HOJE);
    expect(r.status).toBe("ok");
    expect(r.custoBase).toBe(1000);
    const esperado = calculateSellingPrice(1000, cfg).precoComIPI;
    expect(r.precoVenda).toBeCloseTo(esperado, 2);
  });

  it("preço manual trava e mostra custo da composição na margem", () => {
    const produto: ProdutoMestre = {
      id: "p1", nome: "Combo", tipo: "montado", custoComponentes: 1000, precoManual: 3000,
    };
    const r = resolvePrice(produto, [], cfg, HOJE);
    expect(r.status).toBe("travado");
    expect(r.precoVenda).toBe(3000);
    expect(r.custoBase).toBe(1000);
  });

  it("sem composição e sem preço manual → sem_preco_manual", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "Combo", tipo: "montado" };
    const r = resolvePrice(produto, [], cfg, HOJE);
    expect(r.status).toBe("sem_preco_manual");
    expect(r.precoVenda).toBeNull();
  });
});

describe("resolvePrice — montado", () => {
  it("usa preço manual e calcula margem contra custo manual", () => {
    const produto: ProdutoMestre = {
      id: "p1", nome: "Reformer", tipo: "montado", custoManual: 1000, precoManual: 2500,
    };
    const r = resolvePrice(produto, [], cfg, HOJE);
    expect(r.status).toBe("travado"); // override manual
    expect(r.precoVenda).toBe(2500);
    expect(r.custoBase).toBe(1000);
    // margem sobre preço = (2500-1000)/2500 = 60%
    expect(r.margemPercent).toBeCloseTo(60, 4);
  });

  it("sem precoManual e sem custoManual → sem_preco_manual, tudo null", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "Reformer", tipo: "montado" };
    const r = resolvePrice(produto, [], cfg, HOJE);
    expect(r.status).toBe("sem_preco_manual");
    expect(r.precoVenda).toBeNull();
    expect(r.custoBase).toBeNull();
    expect(r.margemPercent).toBeNull();
    expect(r.numNotasPeriodo).toBe(0);
  });

  it("sem precoManual mas com custoManual (sem composição) → usa custo manual + markup", () => {
    const produto: ProdutoMestre = {
      id: "p1", nome: "Reformer", tipo: "montado", custoManual: 1000,
    };
    const r = resolvePrice(produto, [], cfg, HOJE);
    expect(r.status).toBe("ok");
    expect(r.custoBase).toBe(1000);
    const esperado = calculateSellingPrice(1000, cfg).precoComIPI;
    expect(r.precoVenda).toBeCloseTo(esperado, 2);
  });
});
