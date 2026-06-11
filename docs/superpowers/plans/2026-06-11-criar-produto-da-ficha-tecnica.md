# Criar Produto da Ficha Técnica (PDF) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Importar ficha técnica (PDF)" em `/montado` que cria o produto montado inteiro em 1 clique: extrai cabeçalho por posição, classifica itens (fabricado vs matéria-prima), casa matérias-primas no catálogo, find-or-create pelo código e grava a composição — preço sai automático do pipeline existente.

**Architecture:** Reaproveita `composicaoParser.ts` (parse de itens não muda; `extrairCabecalho` é reescrito por posição x/y). Novo módulo puro `composicaoClassify.ts` separa fabricados (`EST/MO/MOP/MOF/KIT`, ignorados no custo) de matérias-primas. Novo `criarProdutoDaFicha.ts` orquestra: casamento no catálogo (função pura) + find-or-create no repo + regravação de componentes. UI: `ImportarFichaDialog.tsx` (botão + diálogo de confirmação editável) plugado em `ProdutoMontado.tsx`. Custo/preço NÃO ganham código novo: `useProdutosResolvidos` já soma componentes e aplica markup.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Supabase (PostgREST), Vitest, shadcn/ui, pdfjs-dist (já encapsulado em `parsers.ts`).

**Spec:** `docs/superpowers/specs/2026-06-11-criar-produto-da-ficha-tecnica-design.md`

**Valores validados no fixture real (`src/lib/__tests__/fixtures/v5plus-real.json`):**
- 384 linhas de item → 244 códigos únicos após `agregarPorCodigo`
- 67 fabricados / 177 matérias-primas
- Cabeçalho: código `V5P` (rótulo em y≈94/x≈22, valor na linha de baixo y≈108/x≈31), descrição `APARELHO V5 PLUS SEM TORRE` (rótulo x≈216, valor x≈226), grupo `01 - PRODUTO ACABADO` (rótulo y≈120, valor y≈133)
- O teste sintético existente (`composicaoParser.test.ts`) tem rótulo e valor na MESMA linha — a extração nova precisa cobrir os dois layouts (mesma linha → linha de baixo como fallback)

---

### Task 1: `composicaoClassify.ts` — classificação por prefixo (puro)

**Files:**
- Create: `src/lib/composicaoClassify.ts`
- Test: `src/lib/__tests__/composicaoClassify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/composicaoClassify.test.ts
import { describe, it, expect } from "vitest";
import {
  PREFIXOS_FABRICADOS,
  prefixoDoCodigo,
  ehFabricado,
  separarComposicao,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/composicaoClassify.test.ts`
Expected: FAIL — `Cannot find module '@/lib/composicaoClassify'` (ou equivalente)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/composicaoClassify.ts
import type { ComposicaoItem } from "@/lib/composicaoParser";

/**
 * Prefixos de itens FABRICADOS por nós (montagem/intermediário). Não aparecem
 * nas notas de compra e são ignorados no custo — a ficha técnica já explode o
 * conteúdo deles até a matéria-prima (contá-los seria dupla contagem).
 */
export const PREFIXOS_FABRICADOS: ReadonlySet<string> = new Set([
  "EST",
  "MO",
  "MOP",
  "MOF",
  "KIT",
]);

/** Parte do código antes do primeiro "." ou espaço, em maiúsculas. */
export function prefixoDoCodigo(codigo: string): string {
  return codigo.trim().split(/[.\s]/, 1)[0].toUpperCase();
}

export function ehFabricado(codigo: string): boolean {
  return PREFIXOS_FABRICADOS.has(prefixoDoCodigo(codigo));
}

export interface ComposicaoSeparada {
  materiaPrima: ComposicaoItem[];
  fabricados: ComposicaoItem[];
}

export function separarComposicao(itens: ComposicaoItem[]): ComposicaoSeparada {
  const materiaPrima: ComposicaoItem[] = [];
  const fabricados: ComposicaoItem[] = [];
  for (const it of itens) {
    (ehFabricado(it.codigo) ? fabricados : materiaPrima).push(it);
  }
  return { materiaPrima, fabricados };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/composicaoClassify.test.ts`
Expected: PASS (todas as asserções)

- [ ] **Step 5: Commit**

```bash
git add src/lib/composicaoClassify.ts src/lib/__tests__/composicaoClassify.test.ts
git commit -m "feat(composicao): classificacao de itens da ficha por prefixo (fabricado vs materia-prima)"
```

---

### Task 2: `extrairCabecalho` por posição + campo `produtoGrupo`

**Files:**
- Modify: `src/lib/composicaoParser.ts` (interface `ComposicaoResult`, função `extrairCabecalho`, retorno de `parseComposicaoFromPositionedItems`)
- Test: `src/lib/__tests__/composicaoParserReal.test.ts` (estender)
- Test: `src/lib/__tests__/composicaoParser.test.ts` (1 asserção nova)

**Contexto do bug:** a `extrairCabecalho` atual usa regex sobre o texto da LINHA concatenada. No PDF real, a linha do rótulo é `"Código do Produto: Descrição do produto:"` (os valores estão na linha DE BAIXO), então a regex captura `"Descri"` como código. A reescrita usa posição: valor na mesma linha à direita do rótulo OU, se vazio, na linha seguinte na mesma coluna (x do rótulo −15 até o próximo rótulo −15).

- [ ] **Step 1: Write the failing tests**

Adicionar ao final de `src/lib/__tests__/composicaoParserReal.test.ts` (dentro do `describe` existente):

```typescript
  it("extrai o cabeçalho por posição: código, descrição e grupo", () => {
    const r = parseComposicaoFromPositionedItems(real as PDFTextItem[][]);
    expect(r.produtoCodigo).toBe("V5P"); // antes saía "Descri"
    expect(r.produtoDescricao).toBe("APARELHO V5 PLUS SEM TORRE");
    expect(r.produtoGrupo).toBe("01 - PRODUTO ACABADO");
  });

  it("classificação estável no PDF real: 244 únicos = 67 fabricados + 177 matérias-primas", () => {
    const r = parseComposicaoFromPositionedItems(real as PDFTextItem[][]);
    const agg = agregarPorCodigo(r.itens);
    expect(agg).toHaveLength(244);
    const { materiaPrima, fabricados } = separarComposicao(agg);
    expect(fabricados).toHaveLength(67);
    expect(materiaPrima).toHaveLength(177);
  });
```

E adicionar o import no topo do mesmo arquivo:

```typescript
import { separarComposicao } from "@/lib/composicaoClassify";
```

Em `src/lib/__tests__/composicaoParser.test.ts`, no primeiro teste (`"extrai código, quantidade e cabeçalho; soma duplicados"`), logo após `expect(result.produtoDescricao).toContain("APARELHO V5 PLUS");` adicionar:

```typescript
    expect(result.produtoGrupo).toBeNull(); // página sintética não tem rótulo de grupo
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/composicaoParserReal.test.ts src/lib/__tests__/composicaoParser.test.ts`
Expected: FAIL — `produtoCodigo` retorna `"Descri"` no teste real; `produtoGrupo` não existe no tipo (erro de compilação) 

- [ ] **Step 3: Implement**

Em `src/lib/composicaoParser.ts`:

**3a.** Alterar a interface `ComposicaoResult` (linhas 13–17) para:

```typescript
export interface ComposicaoResult {
  produtoCodigo: string | null;
  produtoDescricao: string | null;
  produtoGrupo: string | null;
  itens: ComposicaoItem[];
}
```

**3b.** Substituir a função `extrairCabecalho` inteira (linhas 76–87) por:

```typescript
type Cabecalho = { codigo: string | null; descricao: string | null; grupo: string | null };

const ROTULOS_CABECALHO: Array<{ chave: keyof Cabecalho; re: RegExp }> = [
  { chave: "codigo", re: /C[óo]digo do Produto:?/i },
  { chave: "descricao", re: /Descri[çc][ãa]o do produto:?/i },
  { chave: "grupo", re: /Grupo de Produto:?/i },
];

function ehRotuloCabecalho(str: string): boolean {
  return /(C[óo]digo do Produto|Descri[çc][ãa]o do produto|Grupo de Produto)/i.test(str);
}

/**
 * Extrai o cabeçalho POR POSIÇÃO (não por regex no texto concatenado, que
 * captura "Descri" quando os valores estão na linha de baixo do rótulo).
 * Para cada rótulo: 1) valor na MESMA linha, à direita do rótulo e antes do
 * próximo rótulo; 2) senão, valor na LINHA SEGUINTE, na coluna do rótulo.
 * Best-effort: imperfeições são corrigidas no diálogo editável.
 */
function extrairCabecalho(rows: Array<Array<{ str: string; x: number }>>): Cabecalho {
  const resultado: Cabecalho = { codigo: null, descricao: null, grupo: null };

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    for (const { chave, re } of ROTULOS_CABECALHO) {
      if (resultado[chave] !== null) continue;
      const label = cells.find((c) => re.test(c.str));
      if (!label) continue;

      // Limite direito da coluna = x do próximo rótulo na mesma linha.
      const proximoX = cells
        .filter((c) => c.x > label.x && ehRotuloCabecalho(c.str))
        .reduce((min, c) => Math.min(min, c.x), Infinity);

      const mesmaLinha = cells
        .filter((c) => c.x > label.x && c.x < proximoX && !ehRotuloCabecalho(c.str))
        .map((c) => c.str)
        .join(" ")
        .trim();
      if (mesmaLinha) {
        resultado[chave] = mesmaLinha;
        continue;
      }

      const linhaSeguinte = (rows[i + 1] ?? [])
        .filter((c) => c.x >= label.x - 15 && c.x < proximoX - 15 && !ehRotuloCabecalho(c.str))
        .map((c) => c.str)
        .join(" ")
        .trim();
      if (linhaSeguinte) resultado[chave] = linhaSeguinte;
    }
  }
  return resultado;
}
```

**3c.** Em `parseComposicaoFromPositionedItems`, atualizar a inicialização de `cabecalho` (linhas 98–101) e o `return` (linha 138):

```typescript
  let cabecalho: Cabecalho = { codigo: null, descricao: null, grupo: null };
```

```typescript
  return {
    produtoCodigo: cabecalho.codigo,
    produtoDescricao: cabecalho.descricao,
    produtoGrupo: cabecalho.grupo,
    itens,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/composicaoParserReal.test.ts src/lib/__tests__/composicaoParser.test.ts src/lib/__tests__/importPreview.test.ts`
Expected: PASS (incluindo os testes antigos do parser, que têm rótulo+valor na mesma linha)

- [ ] **Step 5: Verificar que nada mais quebrou**

Run: `npx vitest run`
Expected: PASS em todas as suítes (nenhum outro consumidor depende do shape exato de `ComposicaoResult` além de `EditarMontadoDialog`, que só usa `result.itens`)

- [ ] **Step 6: Commit**

```bash
git add src/lib/composicaoParser.ts src/lib/__tests__/composicaoParserReal.test.ts src/lib/__tests__/composicaoParser.test.ts
git commit -m "fix(composicao): extrai cabecalho da ficha por posicao (codigo nao sai mais 'Descri') e adiciona grupo"
```

---

### Task 3: `findOrCreateMontadoByCodigo` no repositório

**Files:**
- Modify: `src/repositories/produtosMestreRepo.ts` (adicionar no final)

**Contexto:** `createProdutoMestre` direto dá erro quando o código já existe no catálogo (índice único em `codigo`, migration `0005_fix_codigo_index.sql` — índice PARCIAL, então `ON CONFLICT` do PostgREST não casa). Mesmo padrão do `upsertCatalogByCodigo` já existente no arquivo: busca id pelo código e decide insert vs update.

- [ ] **Step 1: Implement**

Adicionar ao final de `src/repositories/produtosMestreRepo.ts`:

```typescript
export interface FindOrCreateMontadoInput {
  codigo: string;
  nome: string;
  categoria: string | null;
}

/**
 * Busca o produto pelo código: se existe, atualiza nome/categoria e marca como
 * montado; se não, cria. Evita o erro de código duplicado do índice único
 * parcial (mesmo padrão do upsertCatalogByCodigo: decidir insert vs update no
 * app, nunca ON CONFLICT em `codigo`).
 */
export async function findOrCreateMontadoByCodigo(
  input: FindOrCreateMontadoInput,
): Promise<string> {
  const codigo = input.codigo.trim();
  const patch = {
    nome: input.nome,
    categoria: input.categoria,
    tipo: "montado" as const,
  };

  const { data: existentes, error: selErr } = await supabase
    .from("produtos_mestre")
    .select("id")
    .eq("codigo", codigo)
    .limit(1);
  if (selErr) throw dbErr(selErr);

  if (existentes && existentes.length > 0) {
    const id = existentes[0].id;
    const { error } = await supabase.from("produtos_mestre").update(patch).eq("id", id);
    if (error) throw dbErr(error);
    return id;
  }

  const { data, error } = await supabase
    .from("produtos_mestre")
    .insert({ codigo, ...patch })
    .select("id")
    .single();
  if (error) throw dbErr(error);
  return data.id;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/repositories/produtosMestreRepo.ts
git commit -m "feat(produtos): find-or-create de montado por codigo (corrige erro de duplicado)"
```

---

### Task 4: `criarProdutoDaFicha.ts` — casamento no catálogo + orquestração

**Files:**
- Create: `src/lib/criarProdutoDaFicha.ts`
- Test: `src/lib/__tests__/criarProdutoDaFicha.test.ts` (só a parte pura, `casarNoCatalogo`)

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/criarProdutoDaFicha.test.ts
import { describe, it, expect } from "vitest";
import { casarNoCatalogo } from "@/lib/criarProdutoDaFicha";
import type { ComposicaoItem } from "@/lib/composicaoParser";

function item(codigo: string, quantidade: number, descricao = ""): ComposicaoItem {
  return { codigo, descricao, quantidade };
}

describe("casarNoCatalogo", () => {
  const catalogo = [
    { id: "id-la", codigo: "LA.001" },
    { id: "id-co", codigo: "co.069" }, // catálogo com caixa baixa também casa
    { id: "id-sem-codigo", codigo: null },
  ];

  it("casa por código normalizado (maiúsculas/trim) e separa não encontrados", () => {
    const itens = [
      item("la.001", 2, "LAMINA"),
      item(" CO.069 ", 0.5, "TINTA PO PRETO"),
      item("US.999", 1, "NAO EXISTE"),
    ];
    const r = casarNoCatalogo(itens, catalogo);
    expect(r.encontrados).toEqual([
      { componenteId: "id-la", quantidade: 2, codigo: "la.001" },
      { componenteId: "id-co", quantidade: 0.5, codigo: " CO.069 " },
    ]);
    expect(r.naoEncontrados).toHaveLength(1);
    expect(r.naoEncontrados[0].codigo).toBe("US.999");
  });

  it("catálogo vazio → tudo não encontrado", () => {
    const r = casarNoCatalogo([item("LA.001", 1)], []);
    expect(r.encontrados).toEqual([]);
    expect(r.naoEncontrados).toHaveLength(1);
  });

  it("itens vazios → resultado vazio", () => {
    expect(casarNoCatalogo([], catalogo)).toEqual({ encontrados: [], naoEncontrados: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/criarProdutoDaFicha.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implement**

```typescript
// src/lib/criarProdutoDaFicha.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/criarProdutoDaFicha.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/criarProdutoDaFicha.ts src/lib/__tests__/criarProdutoDaFicha.test.ts
git commit -m "feat(montado): orquestracao criar-produto-da-ficha (casar catalogo + find-or-create + composicao)"
```

---

### Task 5: UI — `ImportarFichaDialog.tsx` + botão em `ProdutoMontado.tsx`

**Files:**
- Create: `src/components/ImportarFichaDialog.tsx`
- Modify: `src/pages/ProdutoMontado.tsx` (header da página, linhas 100–107)

**Padrões a seguir (de `EditarMontadoDialog.tsx`):** input file escondido + botão, `toast` do sonner, query keys `["produtos-resolvidos"]`, `["produtos-mestre"]` e `["componentes", id]`, catálogo via `useProdutosResolvidos()`.

- [ ] **Step 1: Create the dialog component**

```tsx
// src/components/ImportarFichaDialog.tsx
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseComposicaoFile,
  agregarPorCodigo,
  type ComposicaoItem,
} from "@/lib/composicaoParser";
import { separarComposicao } from "@/lib/composicaoClassify";
import {
  casarNoCatalogo,
  criarProdutoDaFicha,
  type ComponenteCasado,
} from "@/lib/criarProdutoDaFicha";
import { useProdutosResolvidos } from "@/hooks/useProdutosResolvidos";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}

interface FichaPreparada {
  codigo: string;
  nome: string;
  grupo: string;
  encontrados: ComponenteCasado[];
  naoEncontrados: ComposicaoItem[];
  fabricadosCount: number;
}

export default function ImportarFichaDialog() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ficha, setFicha] = useState<FichaPreparada | null>(null);

  const produtosQuery = useProdutosResolvidos();

  const lerFicha = async (file: File) => {
    setLendo(true);
    try {
      const result = await parseComposicaoFile(file);
      const agregados = agregarPorCodigo(result.itens);
      if (agregados.length === 0) {
        toast.warning("Nenhum componente reconhecido no PDF da ficha técnica.");
        return;
      }
      const { materiaPrima, fabricados } = separarComposicao(agregados);
      const catalogo = (produtosQuery.data ?? []).map((l) => ({ id: l.id, codigo: l.codigo }));
      const { encontrados, naoEncontrados } = casarNoCatalogo(materiaPrima, catalogo);
      setFicha({
        codigo: result.produtoCodigo ?? "",
        nome: result.produtoDescricao ?? "",
        grupo: result.produtoGrupo ?? "",
        encontrados,
        naoEncontrados,
        fabricadosCount: fabricados.length,
      });
      setOpen(true);
    } catch (err) {
      toast.error(`Falha ao ler a ficha técnica: ${errMsg(err)}`);
    } finally {
      setLendo(false);
    }
  };

  const criar = async () => {
    if (!ficha) return;
    if (ficha.codigo.trim() === "") {
      toast.error("Informe o código do produto.");
      return;
    }
    if (ficha.nome.trim() === "") {
      toast.error("Informe o nome do produto.");
      return;
    }
    setSalvando(true);
    try {
      const r = await criarProdutoDaFicha({
        codigo: ficha.codigo.trim(),
        nome: ficha.nome.trim(),
        categoria: ficha.grupo.trim() === "" ? null : ficha.grupo.trim(),
        componentes: ficha.encontrados.map((e) => ({
          componenteId: e.componenteId,
          quantidade: e.quantidade,
        })),
      });
      queryClient.invalidateQueries({ queryKey: ["componentes", r.montadoId] });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-mestre"] });
      toast.success(
        `Produto "${ficha.nome.trim()}" criado com ${r.vinculados} componente(s). O preço já aparece em Produtos.`,
      );
      setOpen(false);
      setFicha(null);
    } catch (err) {
      toast.error(`Falha ao criar produto: ${errMsg(err)}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lerFicha(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        disabled={lendo || produtosQuery.isLoading}
        onClick={() => fileRef.current?.click()}
      >
        {lendo ? "Lendo ficha…" : "Importar ficha técnica (PDF)"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setFicha(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar produto da ficha técnica</DialogTitle>
            <DialogDescription>
              Confira os dados extraídos do PDF. O custo será a soma das matérias-primas; as
              montagens (EST/MO/MOP/MOF/KIT) são ignoradas para não contar duas vezes.
            </DialogDescription>
          </DialogHeader>

          {ficha && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="f-codigo">Código *</Label>
                  <Input
                    id="f-codigo"
                    value={ficha.codigo}
                    onChange={(e) => setFicha({ ...ficha, codigo: e.target.value })}
                    disabled={salvando}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="f-nome">Nome *</Label>
                  <Input
                    id="f-nome"
                    value={ficha.nome}
                    onChange={(e) => setFicha({ ...ficha, nome: e.target.value })}
                    disabled={salvando}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="f-grupo">Categoria/Grupo</Label>
                  <Input
                    id="f-grupo"
                    value={ficha.grupo}
                    onChange={(e) => setFicha({ ...ficha, grupo: e.target.value })}
                    disabled={salvando}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Matérias-primas encontradas no catálogo
                  </span>
                  <span className="font-medium">{ficha.encontrados.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Não encontradas (ignoradas)</span>
                  <span
                    className={
                      ficha.naoEncontrados.length > 0
                        ? "font-medium text-amber-600"
                        : "font-medium"
                    }
                  >
                    {ficha.naoEncontrados.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montagens ignoradas no custo</span>
                  <span className="font-medium">{ficha.fabricadosCount}</span>
                </div>
              </div>

              {ficha.naoEncontrados.length > 0 && (
                <details className="rounded-lg border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Ver {ficha.naoEncontrados.length} matéria(s)-prima(s) não encontrada(s)
                  </summary>
                  <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto">
                    {ficha.naoEncontrados.map((i) => (
                      <li key={i.codigo} className="flex justify-between gap-2">
                        <span className="font-mono text-xs">{i.codigo}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {i.descricao}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Importe o catálogo Nomus desses itens e reimporte a ficha para incluí-los no
                    custo.
                  </p>
                </details>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void criar()} disabled={salvando || !ficha}>
              {salvando ? "Criando…" : "Criar produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire the button into the page header**

Em `src/pages/ProdutoMontado.tsx`, adicionar o import:

```tsx
import ImportarFichaDialog from "@/components/ImportarFichaDialog";
```

E substituir o bloco do header (linhas 101–107):

```tsx
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Produto montado</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Produtos compostos por outros produtos Nomus. O custo soma os componentes e o preço sai
          do markup (impostos + lucro). Você pode travar um preço manual se quiser.
        </p>
      </div>
```

por:

```tsx
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produto montado</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Produtos compostos por outros produtos Nomus. O custo soma os componentes e o preço sai
            do markup (impostos + lucro). Você pode travar um preço manual se quiser.
          </p>
        </div>
        <ImportarFichaDialog />
      </div>
```

- [ ] **Step 3: Type-check, lint and full test run**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx eslint src/components/ImportarFichaDialog.tsx src/pages/ProdutoMontado.tsx && npx vitest run`
Expected: sem erros, todos os testes PASS

- [ ] **Step 4: Manual verification (golden path)**

Run: `npm run dev` e abrir `http://localhost:8080/montado` (porta conforme `vite.config.ts`) logado.

Verificar:
1. Botão "Importar ficha técnica (PDF)" aparece no topo da página.
2. Subir a ficha técnica real do V5 PLUS → diálogo abre com Código `V5P`, Nome `APARELHO V5 PLUS SEM TORRE`, Grupo `01 - PRODUTO ACABADO` (editáveis).
3. Resumo mostra contagens coerentes (≈177 matérias-primas no total, divididas entre encontradas/não-encontradas conforme o catálogo carregado; 67 montagens ignoradas).
4. "Criar produto" → toast de sucesso → produto na lista de montados com custo (composição) e preço de venda preenchidos.
5. Importar a MESMA ficha de novo → não dá erro de duplicado; atualiza o mesmo produto (find-or-create).
6. Edge: subir um PDF que não é ficha (ex.: uma NF-e em PDF) → toast "Nenhum componente reconhecido", nada criado.
7. Edge: apagar o campo Código no diálogo e clicar Criar → bloqueia com "Informe o código do produto."

- [ ] **Step 5: Commit**

```bash
git add src/components/ImportarFichaDialog.tsx src/pages/ProdutoMontado.tsx
git commit -m "feat(montado): botao 'Importar ficha tecnica (PDF)' cria produto inteiro com confirmacao editavel"
```

---

### Task 6: Verificação final e push

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: todos os testes PASS, build sem erros

- [ ] **Step 2: Push**

```bash
git push -u origin feat/tabela-precos
```

---

## Cobertura do spec (self-review)

| Requisito do spec | Task |
|---|---|
| Botão "Importar ficha técnica (PDF)" em /montado | 5 |
| `extrairCabecalho` por posição (código ≠ "Descri") | 2 |
| Classificação por prefixo (EST/MO/MOP/MOF/KIT) | 1 |
| Diálogo de confirmação editável + contagens + lista colapsável | 5 |
| Find-or-create pelo código (corrige duplicado) | 3 |
| Gravação: clear + insert das matérias-primas casadas | 4 |
| Custo/preço automáticos (sem código novo de cálculo) | 4 (doc) — via `useProdutosResolvidos` existente |
| Código vazio → bloquear | 5 (validação no `criar`) |
| PDF sem itens → toast, não cria nada | 5 (`lerFicha`) |
| Falha de banco → toast com `dbErr` detalhado | 3 (`dbErr`) + 5 (catch) |
| Testes: classify unit + cabeçalho real V5P + 67/177 estável | 1, 2 |
| NÃO incluído: árvore multinível, criação de MP ausente | — (fora de escopo, confirmado) |
