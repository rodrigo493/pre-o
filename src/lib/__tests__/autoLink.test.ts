import { describe, it, expect } from "vitest";
import {
  aplicarAutoVinculo,
  aplicarAutoVinculoPorDescricao,
  construirMapaDescricao,
  normalizeDescricao,
  pendentesComMesmoCprod,
  normalizeCprod,
  type Vinculo,
} from "@/lib/autoLink";

const vinculos: Vinculo[] = [
  { cprod: "ABC-001", produtoMestreId: "m1" },
  { cprod: "ABC-002", produtoMestreId: "m2" },
];

describe("aplicarAutoVinculo", () => {
  it("vincula item cujo cprod já é conhecido (case-insensitive)", () => {
    const r = aplicarAutoVinculo([{ id: "i1", cprod: "abc-001" }], vinculos);
    expect(r.vinculados).toEqual([{ id: "i1", cprod: "abc-001", produtoMestreId: "m1" }]);
    expect(r.pendentes).toHaveLength(0);
  });

  it("deixa item desconhecido na fila de pendentes", () => {
    const r = aplicarAutoVinculo([{ id: "i9", cprod: "NOVO-999" }], vinculos);
    expect(r.vinculados).toHaveLength(0);
    expect(r.pendentes).toEqual([{ id: "i9", cprod: "NOVO-999" }]);
  });

  it("separa lote misto em vinculados e pendentes", () => {
    const r = aplicarAutoVinculo(
      [{ id: "i1", cprod: "ABC-001" }, { id: "i9", cprod: "X" }],
      vinculos,
    );
    expect(r.vinculados.map((v) => v.id)).toEqual(["i1"]);
    expect(r.pendentes.map((p) => p.id)).toEqual(["i9"]);
  });
});

describe("pendentesComMesmoCprod", () => {
  const itens = [
    { id: "i1", cprod: "ABC-001" },
    { id: "i2", cprod: "abc-001" },
    { id: "i3", cprod: " ABC-001 " },
    { id: "i4", cprod: "OUTRO" },
  ];

  it("retorna outros itens com mesmo cprod, case/space-insensitive, excluindo o alvo", () => {
    const r = pendentesComMesmoCprod({ id: "i1", cprod: "ABC-001" }, itens);
    expect(r.map((x) => x.id)).toEqual(["i2", "i3"]);
  });

  it("retorna vazio quando nenhum outro item compartilha o cprod", () => {
    const r = pendentesComMesmoCprod({ id: "i4", cprod: "OUTRO" }, itens);
    expect(r).toHaveLength(0);
  });
});

describe("normalizeCprod", () => {
  it("apara espaços e converte para maiúsculas", () => {
    expect(normalizeCprod("  abc-1 ")).toBe("ABC-1");
  });
});

describe("normalizeDescricao", () => {
  it("remove acento, baixa caixa e colapsa espaços", () => {
    expect(normalizeDescricao("  Chapa  LISA  2,0mm Aço ")).toBe("chapa lisa 2,0mm aco");
  });
});

describe("auto-vínculo por descrição", () => {
  const oficiais = [
    { id: "m1", nome: "Reformer Studio" },
    { id: "m2", nome: "CHAPA LISA 2,0MM" },
    { id: "m3", nome: "Reformer Studio" }, // duplicado → ignorado
  ];
  const mapa = construirMapaDescricao(oficiais);

  it("mapa mantém o primeiro id em descrições duplicadas", () => {
    expect(mapa.get("reformer studio")).toBe("m1");
    expect(mapa.size).toBe(2);
  });

  it("vincula item com descrição idêntica (ignorando acento/caixa/espaços)", () => {
    const r = aplicarAutoVinculoPorDescricao(
      [
        { id: "i1", descricao: "reformer  studio" },
        { id: "i2", descricao: "Produto sem match" },
      ],
      mapa,
    );
    expect(r.vinculados).toEqual([{ id: "i1", produtoMestreId: "m1" }]);
    expect(r.pendentes.map((p) => p.id)).toEqual(["i2"]);
  });
});
