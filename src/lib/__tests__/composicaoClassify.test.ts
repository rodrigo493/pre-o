import { describe, it, expect } from "vitest";
import {
  PREFIXOS_FABRICADOS,
  prefixoDoCodigo,
  ehFabricado,
  separarComposicao,
  ehUsinado,
} from "@/lib/composicaoClassify";
import type { ComposicaoItem } from "@/lib/composicaoParser";

function item(codigo: string, quantidade = 1): ComposicaoItem {
  return { codigo, descricao: "", quantidade };
}

describe("prefixoDoCodigo", () => {
  it("pega a parte antes do primeiro ponto", () => {
    expect(prefixoDoCodigo("EST.001")).toBe("EST");
    expect(prefixoDoCodigo("CO.069")).toBe("CO");
    expect(prefixoDoCodigo("MOF.V5.020")).toBe("MOF");
  });

  it("pega a parte antes do primeiro espaço quando não há ponto antes", () => {
    expect(prefixoDoCodigo("SXT.10X20 5.8")).toBe("SXT");
    expect(prefixoDoCodigo("QUAD 30X30")).toBe("QUAD");
  });

  it("normaliza para maiúsculas e ignora espaços nas bordas", () => {
    expect(prefixoDoCodigo("mo.123")).toBe("MO");
    expect(prefixoDoCodigo("  kit.v5  ")).toBe("KIT");
  });

  it("código sem separador retorna ele inteiro", () => {
    expect(prefixoDoCodigo("V5P")).toBe("V5P");
  });
});

describe("ehFabricado", () => {
  it.each(["EST.001", "MO.123", "MOP.4", "MOF.V5.020", "KIT.V5.130"])(
    "%s é fabricado",
    (codigo) => {
      expect(ehFabricado(codigo)).toBe(true);
    },
  );

  it.each(["LA.001", "US.010", "CO.069", "SXT.10X20 5.8", "TB.25", "V5P"])(
    "%s NÃO é fabricado",
    (codigo) => {
      expect(ehFabricado(codigo)).toBe(false);
    },
  );

  it("prefixo MOTOR não casa com MO (prefixo exato, não startsWith)", () => {
    expect(ehFabricado("MOTOR.X")).toBe(false);
  });
});

describe("separarComposicao", () => {
  it("separa fabricados de matérias-primas preservando ordem e quantidades", () => {
    const itens = [
      item("MOF.V5.020", 1),
      item("CO.069", 2.88),
      item("EST.010", 4),
      item("LA.001", 0.5),
    ];
    const { materiaPrima, fabricados } = separarComposicao(itens);
    expect(fabricados.map((i) => i.codigo)).toEqual(["MOF.V5.020", "EST.010"]);
    expect(materiaPrima.map((i) => i.codigo)).toEqual(["CO.069", "LA.001"]);
    expect(materiaPrima[0].quantidade).toBe(2.88);
  });

  it("lista vazia retorna listas vazias", () => {
    expect(separarComposicao([])).toEqual({ materiaPrima: [], fabricados: [] });
  });
});

describe("PREFIXOS_FABRICADOS", () => {
  it("contém exatamente os prefixos do spec", () => {
    expect([...PREFIXOS_FABRICADOS].sort()).toEqual(["EST", "KIT", "MO", "MOF", "MOP"]);
  });
});

describe("ehUsinado", () => {
  it("reconhece códigos com prefixo US", () => {
    expect(ehUsinado("US.V12.088")).toBe(true);
    expect(ehUsinado("us.001")).toBe(true);
    expect(ehUsinado("US 123")).toBe(true);
  });
  it("não confunde outros prefixos", () => {
    expect(ehUsinado("USB.123")).toBe(false);
    expect(ehUsinado("TB.050.30")).toBe(false);
    expect(ehUsinado("LA.001")).toBe(false);
    expect(ehUsinado("")).toBe(false);
  });
});
