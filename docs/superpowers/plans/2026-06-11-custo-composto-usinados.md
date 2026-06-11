# Custo composto para peças fabricadas (US/TB/LA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custo de produto montado passa a somar, além dos componentes, a mão de obra da nota fiscal do próprio código (`soma_nota`, típico dos US) e o corte laser (`tempo_corte_min` × `valor_hora_laser` global), com marcação automática do prefixo US e decomposição visível na UI.

**Architecture:** Os extras entram DENTRO da recursão de custo (`custoDe`), extraída do hook para a lib pura `custoComposto.ts` (testável). O maior preço da nota do próprio código reusa a janela de 3 meses + conversões via `resolveCustoNota`, extraído de `resolvePrice` sem mudar seu comportamento. `resolvePrice` não muda de assinatura: `custoComponentes` passa a carregar o total (componentes + extras).

**Tech Stack:** React 18 + TypeScript, Vite (`npm run build` = `vite build`, sem tsc no build), Vitest, TanStack Query, Supabase (PostgREST), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-11-custo-composto-usinados-design.md`

**Notas para o implementador:**
- Rodar testes: `npx vitest run` (ou um arquivo: `npx vitest run src/lib/__tests__/<arquivo>`).
- Build: `npm run build` (vite, não roda tsc). `npx tsc --noEmit` tem 3 erros PRÉ-EXISTENTES (EditarMontadoDialog.tsx:94, exportXlsx.test.ts:8, ProdutoMontado.tsx:82) que NÃO são deste trabalho — só não pode criar erros NOVOS. A Tarefa 8 conserta o de ProdutoMontado.tsx como efeito colateral natural.
- Commits: conventional commits em português, SEM atribuição/Co-Authored-By.
- O projeto não tem remote `origin`: apenas commitar, nunca tentar push.
- A migration NÃO é aplicada pelo implementador (rollout operacional com o usuário). O código tolera a coluna ausente em runtime (`undefined` é falsy).

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/0010_custo_composto.sql` | criar | colunas novas |
| `src/integrations/supabase/types.ts` | editar | tipos das colunas novas |
| `src/lib/markupConfig.ts` | editar | `AppConfig` com `valorHoraLaser` |
| `src/lib/__tests__/markupConfig.test.ts` | editar | round-trip com `valor_hora_laser` |
| `src/repositories/configRepo.ts` | editar | ler/gravar `AppConfig` |
| `src/pages/Configuracoes.tsx` | editar | campo "Valor da hora do laser" |
| `src/lib/priceResolution.ts` | editar | extrair `resolveCustoNota` |
| `src/lib/__tests__/priceResolution.test.ts` | editar | testes de `resolveCustoNota` |
| `src/lib/custoComposto.ts` | criar | `custoExtras` + `criarCustoDe` (recursão pura) |
| `src/lib/__tests__/custoComposto.test.ts` | criar | testes das parcelas e recursão |
| `src/lib/composicaoClassify.ts` | editar | helper `ehUsinado` |
| `src/lib/__tests__/composicaoClassify.test.ts` | editar | testes de `ehUsinado` |
| `src/repositories/produtosMestreRepo.ts` | editar | auto-flag `soma_nota` p/ US |
| `src/hooks/useProdutosResolvidos.ts` | editar | integrar `criarCustoDe` + decomposição |
| `src/components/EditarMontadoDialog.tsx` | editar | toggle `soma_nota`, campo tempo, decomposição |
| `src/pages/ProdutoMontado.tsx` | editar | Row literal + badge pendente |

---

### Task 1: Migration 0010 + tipos do Supabase

**Files:**
- Create: `supabase/migrations/0010_custo_composto.sql`
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Criar a migration**

```sql
-- 0010_custo_composto.sql
-- Custo composto de peças fabricadas (US/TB/LA):
-- soma_nota: soma ao custo dos componentes o maior preço da nota do próprio código (3 meses).
-- tempo_corte_min: minutos de corte laser da peça (TB/LA).
-- valor_hora_laser: R$/hora do laser (config global, singleton id=1).

alter table public.produtos_mestre
  add column if not exists soma_nota boolean not null default false,
  add column if not exists tempo_corte_min numeric null;

alter table public.config_markup
  add column if not exists valor_hora_laser numeric not null default 0;
```

- [ ] **Step 2: Atualizar `types.ts`**

Em `src/integrations/supabase/types.ts`:

Na linha do Row de `produtos_mestre`, trocar o final `mais_vendido: boolean; created_at: string }` por:

```ts
mais_vendido: boolean; soma_nota: boolean; tempo_corte_min: number | null; created_at: string }
```

Na linha do Insert de `produtos_mestre`, trocar o final `mais_vendido?: boolean; created_at?: string }` por:

```ts
mais_vendido?: boolean; soma_nota?: boolean; tempo_corte_min?: number | null; created_at?: string }
```

Na linha do Row de `config_markup`, trocar o final `desgaste_maquinas: number; frete: number }` por:

```ts
desgaste_maquinas: number; frete: number; valor_hora_laser: number }
```

(`Insert`/`Update` de config_markup são `Partial<Row>` — nada a fazer.)

- [ ] **Step 3: Verificar que nada quebrou**

Run: `npx vitest run` → todos passam (nenhum teste toca esses tipos ainda).
Run: `npm run build` → sucesso.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_custo_composto.sql src/integrations/supabase/types.ts
git commit -m "feat(db): migration 0010 - soma_nota, tempo_corte_min e valor_hora_laser"
```

---

### Task 2: Config — `AppConfig` com `valorHoraLaser`

**Files:**
- Modify: `src/lib/markupConfig.ts`
- Modify: `src/lib/__tests__/markupConfig.test.ts`
- Modify: `src/repositories/configRepo.ts`
- Modify: `src/pages/Configuracoes.tsx`

`PricingPercentages` e `calculateSellingPrice` (src/lib/pricing.ts) NÃO mudam. `AppConfig` estende `PricingPercentages`, então continua aceito por `resolvePrice` e `calculateSellingPrice`.

- [ ] **Step 1: Escrever o teste que falha**

Substituir o conteúdo de `src/lib/__tests__/markupConfig.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import { rowToConfig, configToRow, type ConfigRow, type AppConfig } from "@/lib/markupConfig";
import { defaultPercentages } from "@/lib/pricing";

const row: ConfigRow = {
  vendas: 7, marketing: 5, custo_operacional: 20, ipi: 5.2, icms: 18,
  pis: 1.65, cofins: 7.6, csll: 9, ir: 25, lucro: 20, desgaste_maquinas: 0,
  valor_hora_laser: 0,
};

const config: AppConfig = { ...defaultPercentages, valorHoraLaser: 0 };

describe("markupConfig map", () => {
  it("rowToConfig mapeia snake_case → AppConfig", () => {
    expect(rowToConfig(row)).toEqual(config);
  });
  it("configToRow é o inverso de rowToConfig", () => {
    expect(configToRow(config)).toEqual(row);
  });
  it("round-trip preserva valor_hora_laser", () => {
    const r: ConfigRow = { ...row, valor_hora_laser: 120 };
    expect(configToRow(rowToConfig(r))).toEqual(r);
    expect(rowToConfig(r).valorHoraLaser).toBe(120);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/__tests__/markupConfig.test.ts`
Expected: FAIL (AppConfig não existe / valor_hora_laser não existe em ConfigRow).

- [ ] **Step 3: Implementar em `markupConfig.ts`**

Substituir o conteúdo de `src/lib/markupConfig.ts` por:

```ts
import type { PricingPercentages } from "@/lib/pricing";

/** Configuração global da aplicação: percentuais do markup + valor da hora do laser. */
export interface AppConfig extends PricingPercentages {
  valorHoraLaser: number;
}

export interface ConfigRow {
  vendas: number; marketing: number; custo_operacional: number;
  ipi: number; icms: number; pis: number; cofins: number;
  csll: number; ir: number; lucro: number; desgaste_maquinas: number;
  valor_hora_laser: number;
}

export function rowToConfig(row: ConfigRow): AppConfig {
  return {
    vendas: row.vendas, marketing: row.marketing,
    custoOperacional: row.custo_operacional, ipi: row.ipi, icms: row.icms,
    pis: row.pis, cofins: row.cofins, csll: row.csll, ir: row.ir,
    lucro: row.lucro, desgasteMaquinas: row.desgaste_maquinas,
    valorHoraLaser: row.valor_hora_laser,
  };
}

export function configToRow(config: AppConfig): ConfigRow {
  return {
    vendas: config.vendas, marketing: config.marketing,
    custo_operacional: config.custoOperacional, ipi: config.ipi, icms: config.icms,
    pis: config.pis, cofins: config.cofins, csll: config.csll, ir: config.ir,
    lucro: config.lucro, desgaste_maquinas: config.desgasteMaquinas,
    valor_hora_laser: config.valorHoraLaser,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/__tests__/markupConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Atualizar `configRepo.ts`**

Substituir o conteúdo de `src/repositories/configRepo.ts` por:

```ts
import { supabase } from "@/integrations/supabase/client";
import { rowToConfig, configToRow, type AppConfig } from "@/lib/markupConfig";
export async function getConfig(): Promise<AppConfig> {
  const { data, error } = await supabase.from("config_markup").select("*").eq("id", 1).single();
  if (error) throw error;
  return rowToConfig({ valor_hora_laser: 0, ...data });
}
export async function saveConfig(config: AppConfig): Promise<void> {
  const { error } = await supabase.from("config_markup").update(configToRow(config)).eq("id", 1);
  if (error) throw error;
}
```

(O spread `{ valor_hora_laser: 0, ...data }` mantém a app funcionando antes de a migration ser aplicada na VPS.)

- [ ] **Step 6: Campo na tela `Configuracoes.tsx`**

Em `src/pages/Configuracoes.tsx`:

a) Trocar o import de pricing e adicionar AppConfig:

```ts
import {
  defaultPercentages,
  percentageLabels,
} from "@/lib/pricing";
import type { AppConfig } from "@/lib/markupConfig";
import type { PricingPercentages } from "@/lib/pricing";
```

b) Trocar `type ConfigForm = PricingPercentages;` por:

```ts
type ConfigForm = AppConfig;
```

c) Trocar `defaultValues: { ...defaultPercentages },` por:

```ts
defaultValues: { ...defaultPercentages, valorHoraLaser: 0 },
```

d) No `onSubmit`, trocar `const config: PricingPercentages = {` por `const config: AppConfig = {` e, depois da linha `desgasteMaquinas: sanitize(values.desgasteMaquinas),`, adicionar:

```ts
      valorHoraLaser: sanitize(values.valorHoraLaser),
```

e) No `restaurarPadrao`, trocar `reset({ ...defaultPercentages });` por:

```ts
    reset({ ...defaultPercentages, valorHoraLaser: 0 });
```

f) Depois do fechamento da grid dos percentuais (`</div>` da `<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">`) e ANTES da `<div className="flex flex-wrap gap-2">` dos botões, adicionar:

```tsx
              <div className="flex flex-col gap-1.5 border-t pt-4 sm:max-w-xs">
                <Label
                  htmlFor="cfg-valorHoraLaser"
                  className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Valor da hora do laser (R$/h)
                </Label>
                <Input
                  id="cfg-valorHoraLaser"
                  type="number"
                  step="0.01"
                  min="0"
                  className="font-mono-num"
                  {...register("valorHoraLaser", { valueAsNumber: true })}
                />
                <span className="text-xs text-muted-foreground">
                  Usado no custo das peças cortadas no laser (TB/LA): tempo de corte ÷ 60 × valor da hora.
                </span>
              </div>
```

- [ ] **Step 7: Verificar**

Run: `npx vitest run` → todos passam.
Run: `npm run build` → sucesso.

- [ ] **Step 8: Commit**

```bash
git add src/lib/markupConfig.ts src/lib/__tests__/markupConfig.test.ts src/repositories/configRepo.ts src/pages/Configuracoes.tsx
git commit -m "feat(config): valor da hora do laser (AppConfig + campo em Configuracoes)"
```

---

### Task 3: Extrair `resolveCustoNota` em `priceResolution.ts`

**Files:**
- Modify: `src/lib/priceResolution.ts`
- Modify: `src/lib/__tests__/priceResolution.test.ts` (só ADICIONA testes; os existentes não mudam)

Refactor sem mudança de comportamento de `resolvePrice` + nova função exportada que o hook usará para o custo da nota do próprio código dos montados com `soma_nota`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao FINAL de `src/lib/__tests__/priceResolution.test.ts` (reusa `HOJE` e `item` já definidos no arquivo):

```ts
import { resolveCustoNota } from "@/lib/priceResolution";

describe("resolveCustoNota — maior custo da nota do próprio código", () => {
  it("retorna o maior custo convertido na janela de 3 meses", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "US.V12.088", tipo: "montado" };
    const r = resolveCustoNota(
      produto,
      [item(10, "2026-05-01"), item(15, "2026-04-10"), item(99, "2026-01-01")],
      HOJE,
    );
    expect(r.custo).toBe(15);
    expect(r.numNotas).toBe(2);
    expect(r.origem?.dataEmissao).toBe("2026-04-10");
  });

  it("sem item na janela → custo null", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "US.V12.088", tipo: "montado" };
    const r = resolveCustoNota(produto, [item(99, "2026-01-01")], HOJE);
    expect(r.custo).toBeNull();
    expect(r.origem).toBeNull();
    expect(r.numNotas).toBe(0);
  });

  it("aplica o fator do produto com operação multiplicar (kg → barra)", () => {
    const tubo: ProdutoMestre = {
      id: "p1", nome: "Tubo 50x30x2", tipo: "comprado",
      fatorConversao: 14.5, conversaoOp: "multiplicar",
    };
    const r = resolveCustoNota(tubo, [item(7.56, "2026-05-01")], HOJE);
    expect(r.custo).toBeCloseTo(109.62, 2); // 7,56 R$/kg × 14,5 kg/barra
  });

  it("fator do vínculo (cProd) tem prioridade e sempre divide", () => {
    const p: ProdutoMestre = {
      id: "p1", nome: "X", tipo: "comprado",
      fatorConversao: 2, conversaoOp: "multiplicar",
    };
    const it: ItemNota = { ...item(100, "2026-05-01"), fatorConversao: 100 };
    const r = resolveCustoNota(p, [it], HOJE);
    expect(r.custo).toBe(1); // 100 / 100 (vínculo vence o fator do produto)
  });
});
```

Nota: mover esse `import` para o topo do arquivo, junto do import existente de `resolvePrice` (pode virar `import { resolvePrice, resolveCustoNota, type ItemNota, type ProdutoMestre } from "@/lib/priceResolution";`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/__tests__/priceResolution.test.ts`
Expected: FAIL — `resolveCustoNota` não é exportada.

- [ ] **Step 3: Implementar a extração**

Em `src/lib/priceResolution.ts`, ANTES de `export function resolvePrice(...)`, adicionar:

```ts
export interface CustoNotaResult {
  custo: number | null;
  origem: PriceOrigem | null;
  numNotas: number;
}

/**
 * Maior custo unitário da nota na janela móvel de 3 meses, convertido para a
 * unidade do produto. Prioridade: fator do vínculo (cProd, sempre divide) →
 * fator do produto (op ÷/×). Usado pelo comprado (resolvePrice) e pela parcela
 * de mão de obra dos montados com soma_nota.
 */
export function resolveCustoNota(
  produto: ProdutoMestre,
  itens: ItemNota[],
  hoje: Date,
): CustoNotaResult {
  const recentes = itensNaJanela(itens, hoje);
  const convertidos = recentes.map((it) => {
    let custo = it.custoUnitario;
    if (it.fatorConversao != null && it.fatorConversao > 0) {
      custo = it.custoUnitario / it.fatorConversao;
    } else if (produto.fatorConversao != null && produto.fatorConversao > 0) {
      custo =
        produto.conversaoOp === "dividir"
          ? it.custoUnitario / produto.fatorConversao
          : it.custoUnitario * produto.fatorConversao;
    }
    return { item: it, custo };
  });
  const maior = convertidos.reduce<{ item: ItemNota; custo: number } | null>(
    (acc, c) => (acc == null || c.custo > acc.custo ? c : acc),
    null,
  );
  return {
    custo: maior?.custo ?? null,
    origem: maior
      ? { notaId: maior.item.notaId, notaNumero: maior.item.notaNumero, dataEmissao: maior.item.dataEmissao }
      : null,
    numNotas: recentes.length,
  };
}
```

Dentro de `resolvePrice`, substituir o bloco do início (da linha `const recentes = itensNaJanela(itens, hoje);` até a atribuição de `origem`, inclusive) por:

```ts
  const conversaoPendente = false;
  const { custo: custoComprado, origem, numNotas } = resolveCustoNota(produto, itens, hoje);
```

E substituir TODAS as ocorrências de `recentes.length` dentro de `resolvePrice` por `numNotas` (são 2: no retorno do override manual e no retorno final do comprado).

- [ ] **Step 4: Rodar e ver passar (todos, inclusive os 15 antigos)**

Run: `npx vitest run src/lib/__tests__/priceResolution.test.ts`
Expected: PASS — comportamento de `resolvePrice` idêntico.

- [ ] **Step 5: Commit**

```bash
git add src/lib/priceResolution.ts src/lib/__tests__/priceResolution.test.ts
git commit -m "refactor(custo): extrai resolveCustoNota da resolucao do comprado (sem mudanca de comportamento)"
```

---

### Task 4: `custoComposto.ts` — extras + recursão pura

**Files:**
- Create: `src/lib/custoComposto.ts`
- Create: `src/lib/__tests__/custoComposto.test.ts`

Extrai a recursão `custoDe` do hook para uma lib pura e adiciona as parcelas extras. Fórmula: `custo(montado) = Σ custoDe(componente)×qtd (ou custo_manual se sem componentes) + mão de obra (soma_nota) + corte laser`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/__tests__/custoComposto.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/__tests__/custoComposto.test.ts`
Expected: FAIL — módulo `@/lib/custoComposto` não existe.

- [ ] **Step 3: Implementar `src/lib/custoComposto.ts`**

```ts
// Custo composto de produtos fabricados (US/TB/LA):
// custo(montado) = Σ componentes (ou custo_manual se sem composição)
//                + mão de obra da nota do próprio código (soma_nota)
//                + corte laser (tempo_corte_min/60 × valor_hora_laser).

export interface ExtrasInput {
  somaNota: boolean;
  /** Maior custo da nota do próprio código na janela de 3 meses (null = sem nota). */
  custoNota: number | null;
  tempoCorteMin: number | null;
  valorHoraLaser: number;
}

export interface ExtrasResult {
  maoDeObra: number;
  corteLaser: number;
  /** soma_nota ligado mas sem nota do código na janela → parcela 0 + alerta. */
  maoDeObraPendente: boolean;
}

export function custoExtras(i: ExtrasInput): ExtrasResult {
  const maoDeObra = i.somaNota && i.custoNota != null ? i.custoNota : 0;
  const maoDeObraPendente = i.somaNota && i.custoNota == null;
  const corteLaser =
    i.tempoCorteMin != null && i.tempoCorteMin > 0 && i.valorHoraLaser > 0
      ? (i.tempoCorteMin / 60) * i.valorHoraLaser
      : 0;
  return { maoDeObra, corteLaser, maoDeObraPendente };
}

export interface ProdutoCusto {
  id: string;
  tipo: "comprado" | "montado";
  custoManual: number | null;
  somaNota: boolean;
  tempoCorteMin: number | null;
}

export interface ComponenteRef {
  componenteId: string;
  qtd: number;
}

export interface CustoDeParams {
  produtos: Map<string, ProdutoCusto>;
  /** Custo resolvido dos comprados (maior da nota, já convertido). */
  custoCompradoPorId: Map<string, number | null>;
  /** Custo da nota do PRÓPRIO código dos montados (mão de obra US). */
  custoNotaPorId: Map<string, number | null>;
  compPorMontado: Map<string, ComponenteRef[]>;
  valorHoraLaser: number;
}

/**
 * Cria a função recursiva de custo com memo e guarda de ciclo. Os extras entram
 * DENTRO da recursão: uma peça US/TB/LA usada como componente de um aparelho
 * propaga o custo completo (material + serviço).
 */
export function criarCustoDe(p: CustoDeParams): (id: string) => number {
  const memo = new Map<string, number>();
  const visitando = new Set<string>();
  const custoDe = (id: string): number => {
    const cache = memo.get(id);
    if (cache != null) return cache;
    const m = p.produtos.get(id);
    if (!m) return 0;
    if (m.tipo !== "montado") {
      const v = p.custoCompradoPorId.get(id) ?? 0;
      memo.set(id, v);
      return v;
    }
    if (visitando.has(id)) return 0; // ciclo: evita recursão infinita
    visitando.add(id);
    const comps = p.compPorMontado.get(id) ?? [];
    const extras = custoExtras({
      somaNota: m.somaNota,
      custoNota: p.custoNotaPorId.get(id) ?? null,
      tempoCorteMin: m.tempoCorteMin,
      valorHoraLaser: p.valorHoraLaser,
    });
    const parcial =
      comps.length > 0
        ? comps.reduce((s, c) => s + custoDe(c.componenteId) * c.qtd, 0)
        : m.custoManual ?? 0;
    const v = parcial + extras.maoDeObra + extras.corteLaser;
    visitando.delete(id);
    memo.set(id, v);
    return v;
  };
  return custoDe;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/__tests__/custoComposto.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/custoComposto.ts src/lib/__tests__/custoComposto.test.ts
git commit -m "feat(custo): custoExtras e criarCustoDe - parcelas de mao de obra e corte laser na recursao"
```

---

### Task 5: `ehUsinado` + marcação automática do prefixo US

**Files:**
- Modify: `src/lib/composicaoClassify.ts`
- Modify: `src/lib/__tests__/composicaoClassify.test.ts` (só adiciona)
- Modify: `src/repositories/produtosMestreRepo.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao FINAL de `src/lib/__tests__/composicaoClassify.test.ts`:

```ts
import { ehUsinado } from "@/lib/composicaoClassify";

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
```

(Mover o `import` para o topo do arquivo, junto dos imports existentes de `@/lib/composicaoClassify`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/__tests__/composicaoClassify.test.ts`
Expected: FAIL — `ehUsinado` não exportado.

- [ ] **Step 3: Implementar em `composicaoClassify.ts`**

Adicionar ao final de `src/lib/composicaoClassify.ts` (usa o `prefixoDoCodigo` já existente no arquivo):

```ts
/** Código de peça usinada (US): a nota fiscal do próprio código é a mão de obra do torneiro. */
export function ehUsinado(codigo: string): boolean {
  return prefixoDoCodigo(codigo) === "US";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/__tests__/composicaoClassify.test.ts`
Expected: PASS.

- [ ] **Step 5: Auto-flag nos repositórios**

Em `src/repositories/produtosMestreRepo.ts`:

a) Adicionar import no topo:

```ts
import { ehUsinado } from "@/lib/composicaoClassify";
```

b) Em `upsertCatalogByCodigo`, trocar a declaração de `const base = {` ... `};` por:

```ts
    const base: Insert = {
      codigo: p.codigo,
      nome: p.nome,
      unidade: p.unidade,
      unidade_secundaria: p.unidade_secundaria,
      tipo: p.tipo,
      categoria: p.categoria,
      // Prefixo US: a nota do próprio código é a mão de obra do torneiro.
      ...(p.tipo === "montado" && ehUsinado(p.codigo) ? { soma_nota: true } : {}),
    };
```

(Produtos não-US não têm a chave no patch → updates não tocam `soma_nota` existente.)

c) Em `findOrCreateMontadoByCodigo`, trocar a declaração de `const patch = {` ... `};` por:

```ts
  const patch = {
    nome: input.nome,
    categoria: input.categoria,
    tipo: "montado" as const,
    ...(ehUsinado(codigo) ? { soma_nota: true } : {}),
  };
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run` → todos passam.
Run: `npm run build` → sucesso.

- [ ] **Step 7: Commit**

```bash
git add src/lib/composicaoClassify.ts src/lib/__tests__/composicaoClassify.test.ts src/repositories/produtosMestreRepo.ts
git commit -m "feat(usinados): marcacao automatica soma_nota para prefixo US no catalogo e na ficha"
```

---

### Task 6: Integração no `useProdutosResolvidos`

**Files:**
- Modify: `src/lib/priceResolution.ts` (só a interface `ProdutoMestre`)
- Modify: `src/hooks/useProdutosResolvidos.ts`

Sem teste novo (lógica já coberta nas Tasks 3-4; o hook vira orquestração fina). `resolvePrice` não muda: `custoComponentes` carrega o total com extras — isso implementa a decomposição do spec no nível da linha (`LinhaProduto`), onde a UI consome.

- [ ] **Step 1: Campos novos na interface `ProdutoMestre`**

Em `src/lib/priceResolution.ts`, dentro de `export interface ProdutoMestre`, adicionar após `custoComponentes?: number | null;`:

```ts
  /** Soma ao custo a mão de obra da nota do próprio código (US). */
  somaNota?: boolean;
  /** Minutos de corte laser da peça (TB/LA). null = não corta no laser. */
  tempoCorteMin?: number | null;
```

- [ ] **Step 2: Reescrever o hook**

Substituir o conteúdo de `src/hooks/useProdutosResolvidos.ts` por:

```ts
import { useQuery } from "@tanstack/react-query";
import { listProdutosMestre } from "@/repositories/produtosMestreRepo";
import { listItensComData } from "@/repositories/itensNotaRepo";
import { listComponentes } from "@/repositories/componentesMontadoRepo";
import { listVinculos } from "@/repositories/vinculosRepo";
import { getConfig } from "@/repositories/configRepo";
import {
  resolvePrice,
  resolveCustoNota,
  type ItemNota,
  type ProdutoMestre,
  type ResolvedPrice,
} from "@/lib/priceResolution";
import { criarCustoDe, custoExtras, type ProdutoCusto } from "@/lib/custoComposto";

export interface LinhaProduto extends ProdutoMestre {
  resolvido: ResolvedPrice;
  maisVendido: boolean;
  temVinculo: boolean;
  /** Decomposição do custo do montado (0 quando não se aplica). */
  custoMaoDeObra: number;
  custoCorteLaser: number;
  /** soma_nota ligado mas sem nota do código nos últimos 3 meses. */
  maoDeObraPendente: boolean;
  /** Maior custo da nota do PRÓPRIO código (montados; null = sem nota na janela). */
  custoNotaProprio: number | null;
}

export function useProdutosResolvidos() {
  return useQuery({
    queryKey: ["produtos-resolvidos"],
    queryFn: async (): Promise<LinhaProduto[]> => {
      const [mestres, itens, cfg, componentes, vinculos] = await Promise.all([
        listProdutosMestre(), listItensComData(), getConfig(), listComponentes(), listVinculos(),
      ]);
      const hoje = new Date();
      // Fator de conversão por cProd (vínculo): custo_real = custo / fator.
      const fatorPorCprod = new Map<string, number>();
      for (const v of vinculos) {
        if (v.fatorConversao != null && v.fatorConversao > 0) {
          fatorPorCprod.set(v.cprod.trim().toUpperCase(), v.fatorConversao);
        }
      }
      const porMestre = new Map<string, ItemNota[]>();
      for (const it of itens) {
        if (!it.produto_mestre_id) continue;
        const arr = porMestre.get(it.produto_mestre_id) ?? [];
        arr.push({ id: it.id, custoUnitario: Number(it.custo_unitario), dataEmissao: it.data_emissao, notaId: it.nota_id, notaNumero: it.nota_numero ?? undefined, unidade: it.unidade, fatorConversao: fatorPorCprod.get(it.cprod.trim().toUpperCase()) });
        porMestre.set(it.produto_mestre_id, arr);
      }

      const base = (m: typeof mestres[number]): ProdutoMestre => ({
        id: m.id, nome: m.nome, categoria: m.categoria, tipo: m.tipo,
        custoManual: m.custo_manual, precoManual: m.preco_manual, codigo: m.codigo,
        unidade: m.unidade, unidadeSecundaria: m.unidade_secundaria, fatorConversao: m.fator_conversao,
        conversaoOp: m.conversao_op,
        somaNota: m.soma_nota ?? false,
        tempoCorteMin: m.tempo_corte_min,
      });

      // Custo de matéria-prima (comprado) = maior custo das notas (sem componentes).
      const custoCompradoPorId = new Map<string, number | null>();
      // Custo da nota do PRÓPRIO código dos montados (mão de obra dos US).
      const custoNotaPorId = new Map<string, number | null>();
      for (const m of mestres) {
        const itensM = porMestre.get(m.id) ?? [];
        if (m.tipo !== "montado") {
          const r = resolvePrice(base(m), itensM, cfg, hoje);
          custoCompradoPorId.set(m.id, r.custoBase);
        } else {
          custoNotaPorId.set(m.id, itensM.length > 0 ? resolveCustoNota(base(m), itensM, hoje).custo : null);
        }
      }

      // Componentes agrupados por montado.
      const compPorMontado = new Map<string, Array<{ componenteId: string; qtd: number }>>();
      for (const c of componentes) {
        const arr = compPorMontado.get(c.montado_id) ?? [];
        arr.push({ componenteId: c.componente_id, qtd: Number(c.quantidade) });
        compPorMontado.set(c.montado_id, arr);
      }

      // Custo recursivo com extras (mão de obra da nota + corte laser) dentro da recursão.
      const produtosCusto = new Map<string, ProdutoCusto>(
        mestres.map((m) => [m.id, {
          id: m.id,
          tipo: m.tipo,
          custoManual: m.custo_manual != null ? Number(m.custo_manual) : null,
          somaNota: m.soma_nota ?? false,
          tempoCorteMin: m.tempo_corte_min != null ? Number(m.tempo_corte_min) : null,
        }]),
      );
      const custoDe = criarCustoDe({
        produtos: produtosCusto,
        custoCompradoPorId,
        custoNotaPorId,
        compPorMontado,
        valorHoraLaser: cfg.valorHoraLaser,
      });

      return mestres.map((m) => {
        const produto = base(m);
        let custoMaoDeObra = 0;
        let custoCorteLaser = 0;
        let maoDeObraPendente = false;
        if (m.tipo === "montado") {
          const extras = custoExtras({
            somaNota: m.soma_nota ?? false,
            custoNota: custoNotaPorId.get(m.id) ?? null,
            tempoCorteMin: m.tempo_corte_min != null ? Number(m.tempo_corte_min) : null,
            valorHoraLaser: cfg.valorHoraLaser,
          });
          custoMaoDeObra = extras.maoDeObra;
          custoCorteLaser = extras.corteLaser;
          maoDeObraPendente = extras.maoDeObraPendente;
          const temComps = (compPorMontado.get(m.id)?.length ?? 0) > 0;
          if (temComps || extras.maoDeObra > 0 || extras.corteLaser > 0) {
            produto.custoComponentes = custoDe(m.id);
          }
        }
        return {
          ...produto,
          maisVendido: m.mais_vendido ?? false,
          temVinculo: (porMestre.get(m.id)?.length ?? 0) > 0,
          custoMaoDeObra,
          custoCorteLaser,
          maoDeObraPendente,
          custoNotaProprio: m.tipo === "montado" ? custoNotaPorId.get(m.id) ?? null : null,
          resolvido: resolvePrice(produto, porMestre.get(m.id) ?? [], cfg, hoje),
        };
      });
    },
  });
}
```

- [ ] **Step 3: Verificar**

Run: `npx vitest run` → todos passam.
Run: `npm run build` → sucesso.
Run: `npx tsc --noEmit` → apenas os 3 erros pré-existentes (nenhum novo neste hook).

- [ ] **Step 4: Commit**

```bash
git add src/lib/priceResolution.ts src/hooks/useProdutosResolvidos.ts
git commit -m "feat(custo): extras de mao de obra e corte laser na recursao do useProdutosResolvidos"
```

---

### Task 7: UI — `EditarMontadoDialog` (toggle, tempo de corte e decomposição)

**Files:**
- Modify: `src/components/EditarMontadoDialog.tsx`

Não existe componente shadcn `Switch`/`Checkbox` no projeto — usar `<input type="checkbox">` nativo. A decomposição do custo (Componentes + Mão de obra + Corte laser = Custo) aparece no box de resumo deste dialog, que é a tela de detalhe do montado.

- [ ] **Step 1: Estados e carregamento**

a) Depois de `const [preco, setPreco] = useState("");` adicionar:

```ts
  const [somaNota, setSomaNota] = useState(false);
  const [tempoCorte, setTempoCorte] = useState("");
```

b) No `useEffect` que carrega o produto, depois de `setPreco(...)`, adicionar:

```ts
    setSomaNota(produto?.soma_nota ?? false);
    setTempoCorte(produto?.tempo_corte_min != null ? String(produto.tempo_corte_min) : "");
```

- [ ] **Step 2: Cálculo da decomposição (preview ao vivo)**

Depois do `useMemo` de `custoTotal` e ANTES do de `precoCalculado`, adicionar:

```ts
  const linhaAtual = useMemo(
    () => linhas.find((l) => l.id === produto?.id) ?? null,
    [linhas, produto],
  );
  const custoNotaProprio = linhaAtual?.custoNotaProprio ?? null;
  const maoDeObra = somaNota ? custoNotaProprio ?? 0 : 0;
  const maoDeObraPendente = somaNota && custoNotaProprio == null;
  const tempoNum = parseNumber(tempoCorte);
  const corteLaser =
    tempoNum != null && !Number.isNaN(tempoNum) && tempoNum > 0 && configQuery.data
      ? (tempoNum / 60) * configQuery.data.valorHoraLaser
      : 0;
  const custoComExtras = custoTotal + maoDeObra + corteLaser;
```

E trocar o `precoCalculado` para usar o total com extras:

```ts
  const precoCalculado = useMemo(() => {
    if (!configQuery.data || custoComExtras <= 0) return null;
    return calculateSellingPrice(custoComExtras, configQuery.data, 0).precoComIPI;
  }, [configQuery.data, custoComExtras]);
```

- [ ] **Step 3: Campos de serviço na UI**

Depois do box de resumo (`<div className="flex flex-col items-end gap-1 rounded-lg bg-muted/40 p-3">...</div>`) e ANTES da seção "Preço manual opcional", adicionar:

```tsx
        {/* Serviço (US / corte laser) */}
        <div className="mt-2 flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">Serviço (peça fabricada)</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={somaNota}
              onChange={(e) => setSomaNota(e.target.checked)}
              disabled={busy}
            />
            <span>
              Somar mão de obra da nota
              <span className="block text-xs text-muted-foreground">
                Usa o maior preço da nota deste código nos últimos 3 meses (ex.: torneiro dos US).
              </span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="m-tempo-corte">Tempo de corte laser (min)</Label>
            <Input
              id="m-tempo-corte"
              type="number"
              min="0"
              step="0.1"
              value={tempoCorte}
              onChange={(e) => setTempoCorte(e.target.value)}
              placeholder="vazio = não corta no laser"
              disabled={busy}
            />
            <span className="text-xs text-muted-foreground">
              Custo = tempo ÷ 60 × valor da hora do laser (em Configurações).
            </span>
          </div>
        </div>
```

- [ ] **Step 4: Decomposição no box de resumo**

Substituir o box de resumo inteiro (`<div className="flex flex-col items-end gap-1 rounded-lg bg-muted/40 p-3">` até seu `</div>`) por:

```tsx
          <div className="flex flex-col items-end gap-1 rounded-lg bg-muted/40 p-3">
            <div className="flex w-full justify-between text-sm">
              <span className="text-muted-foreground">Componentes</span>
              <span className="font-mono-num">{formatCurrency(custoTotal)}</span>
            </div>
            {somaNota && (
              <div className="flex w-full justify-between text-sm">
                <span className="text-muted-foreground">
                  Mão de obra (nota)
                  {maoDeObraPendente && (
                    <span className="ml-2 text-[11px] text-amber-600">
                      sem nota deste código nos últimos 3 meses
                    </span>
                  )}
                </span>
                <span className="font-mono-num">{formatCurrency(maoDeObra)}</span>
              </div>
            )}
            {corteLaser > 0 && (
              <div className="flex w-full justify-between text-sm">
                <span className="text-muted-foreground">Corte laser</span>
                <span className="font-mono-num">{formatCurrency(corteLaser)}</span>
              </div>
            )}
            <div className="flex w-full justify-between border-t pt-1 text-sm">
              <span className="text-muted-foreground">Custo total</span>
              <span className="font-mono-num font-medium">{formatCurrency(custoComExtras)}</span>
            </div>
            <div className="flex w-full justify-between text-sm">
              <span className="text-muted-foreground">Preço de venda (markup)</span>
              <span className="font-mono-num font-semibold text-foreground">
                {precoCalculado != null ? formatCurrency(precoCalculado) : "—"}
              </span>
            </div>
          </div>
```

- [ ] **Step 5: Salvar os campos novos**

Em `salvarDados`, depois da validação de `precoNum`, adicionar:

```ts
    const tempoSalvar = parseNumber(tempoCorte);
    if (tempoSalvar != null && (Number.isNaN(tempoSalvar) || tempoSalvar < 0)) {
      toast.error("Tempo de corte inválido.");
      return;
    }
```

E no objeto do `updateProdutoMestre`, depois de `preco_manual: precoNum,` adicionar:

```ts
        soma_nota: somaNota,
        tempo_corte_min: tempoSalvar,
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run` → todos passam.
Run: `npm run build` → sucesso.

- [ ] **Step 7: Commit**

```bash
git add src/components/EditarMontadoDialog.tsx
git commit -m "feat(montado): toggle soma_nota, tempo de corte laser e decomposicao do custo no dialog"
```

---

### Task 8: UI — `ProdutoMontado.tsx` (Row literal + badge pendente)

**Files:**
- Modify: `src/pages/ProdutoMontado.tsx`

- [ ] **Step 1: Completar o Row literal de `abrirEdicao`**

Em `abrirEdicao`, dentro do objeto passado a `setEditando`, depois de `fator_conversao: linha.fatorConversao ?? null,` adicionar:

```ts
      conversao_op: linha.conversaoOp ?? null,
      soma_nota: linha.somaNota ?? false,
      tempo_corte_min: linha.tempoCorteMin ?? null,
```

(Isso também conserta o erro pré-existente de `conversao_op` ausente em tsc.)

- [ ] **Step 2: Badge de mão de obra pendente**

Na célula do nome na tabela, trocar:

```tsx
                      <TableCell className="font-medium">{p.nome}</TableCell>
```

por:

```tsx
                      <TableCell className="font-medium">
                        {p.nome}
                        {p.maoDeObraPendente && (
                          <span
                            className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                            title="Soma mão de obra da nota, mas não há nota deste código nos últimos 3 meses — a parcela está valendo R$ 0."
                          >
                            sem nota do serviço
                          </span>
                        )}
                      </TableCell>
```

- [ ] **Step 3: Verificar**

Run: `npx vitest run` → todos passam.
Run: `npm run build` → sucesso.
Run: `npx tsc --noEmit` → agora só 2 erros pré-existentes (EditarMontadoDialog.tsx:94 e exportXlsx.test.ts:8); o de ProdutoMontado sumiu.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProdutoMontado.tsx
git commit -m "feat(montado): badge de mao de obra pendente e campos novos ao abrir edicao"
```

---

### Task 9: Verificação final

- [ ] **Step 1: Suite completa + build**

Run: `npx vitest run`
Expected: todos os testes passam (suite anterior + ~21 novos).

Run: `npm run build`
Expected: build vite sem erros.

- [ ] **Step 2: Revisão do diff completo**

Run: `git log --oneline main..HEAD` e `git diff 6b854ef...HEAD --stat` para conferir que só os arquivos listados neste plano mudaram.

- [ ] **Step 3: Lembrete de rollout (NÃO executar — informar o usuário)**

1. Aplicar `supabase/migrations/0010_custo_composto.sql` no Supabase (SQL editor ou CLI).
2. Configurar o valor da hora do laser em Configurações.
3. Cadastrar peso da barra/chapa nas bitolas (fator de conversão × multiplicar no Editar Preço).
4. Importar fichas técnicas dos US/TB/LA.
5. Preencher tempo de corte dos TB/LA; conferir `soma_nota` dos US.
