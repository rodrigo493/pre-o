# Calculador de peças LA (chapa laser) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/calculador` onde, por peça LA, informa-se espessura + medidas + tempo de corte; o custo (material da chapa + laser) é gravado como receita e recalculado dinamicamente conforme as notas da chapa mudam.

**Architecture:** Duas tabelas novas (`config_chapas` seed + `pecas_laser` receita por peça). Cálculo puro em `laserCost.ts`. A peça LA é `comprado`; seu custo é **sobrescrito** em `custoCompradoPorId` dentro de `useProdutosResolvidos` (a recursão de montados já lê esse mapa), então o custo flui para os montados e para Produtos. R$/kg da chapa vem do `custoBase` da chapa (notas), igual ao resto do sistema.

**Tech Stack:** React + TS, Supabase (Postgres), TanStack Query, Vitest, shadcn/ui, sonner.

---

## File Structure

- Create: `supabase/migrations/0011_pecas_laser.sql` — tabelas `config_chapas` + `pecas_laser`, seed, RLS.
- Modify: `src/integrations/supabase/types.ts` — tipos das 2 tabelas novas.
- Create: `src/lib/laserCost.ts` — cálculo puro do custo da peça LA.
- Create: `src/lib/__tests__/laserCost.test.ts` — testes do cálculo.
- Create: `src/repositories/configChapasRepo.ts` — leitura do mapa de chapas.
- Create: `src/repositories/pecasLaserRepo.ts` — CRUD da receita por peça.
- Modify: `src/hooks/useProdutosResolvidos.ts` — override do custo das peças LA.
- Create: `src/pages/Calculador.tsx` — UI da página.
- Modify: `src/App.tsx` — rota `/calculador`.
- Modify: `src/components/AppLayout.tsx` — item de menu "Calculador".

---

## Task 1: Migration — tabelas, seed e RLS

**Files:**
- Create: `supabase/migrations/0011_pecas_laser.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 0011_pecas_laser.sql — Calculador de custo de peças LA (chapa laser)
-- config_chapas: mapa espessura → chapa do catálogo + área da chapa + peso.
-- pecas_laser: receita por peça LA (espessura, medidas, tempo). Custo é recalculado
-- na aplicação: material = (área_peça/área_chapa) × (R$/kg da chapa nas notas × peso)
--               laser   = (tempo_corte_seg/3600) × valor_hora_laser.

create table if not exists public.config_chapas (
  espessura numeric primary key,
  chapa_codigo text not null,
  area_mm2 numeric not null,
  peso_kg numeric not null
);

insert into public.config_chapas (espessura, chapa_codigo, area_mm2, peso_kg) values
  (1.2,  'CH.LISA.1200X3000X1,2MM', 3600000, 34),
  (2.0,  'CH.LISA.1200X3000X2,0MM', 3600000, 56.8),
  (3.17, 'CH.LISA.1200X3000X3,00MM', 3600000, 85),
  (4.76, 'CH.LISA.1500X3000X4,75MM', 4500000, 169),
  (6.35, 'CH.LISA.1500X3000X6,30MM', 4500000, 223)
on conflict (espessura) do update
  set chapa_codigo = excluded.chapa_codigo,
      area_mm2 = excluded.area_mm2,
      peso_kg = excluded.peso_kg;

create table if not exists public.pecas_laser (
  produto_mestre_id uuid primary key references public.produtos_mestre(id) on delete cascade,
  espessura numeric not null references public.config_chapas(espessura),
  largura_mm numeric not null,
  comprimento_mm numeric not null,
  tempo_corte_seg numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.config_chapas enable row level security;
drop policy if exists "auth_all_config_chapas" on public.config_chapas;
create policy "auth_all_config_chapas" on public.config_chapas
  for all to authenticated using (true) with check (true);

alter table public.pecas_laser enable row level security;
drop policy if exists "auth_all_pecas_laser" on public.pecas_laser;
create policy "auth_all_pecas_laser" on public.pecas_laser
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Aplicar no banco**

Run: `npx supabase db push` (ou aplicar via o fluxo de migração já usado no projeto — ver `project_squados_db_deploy` se necessário). Caso o projeto aplique migrations manualmente no Supabase, rodar o SQL no editor.
Expected: tabelas `config_chapas` (5 linhas) e `pecas_laser` (vazia) criadas, RLS habilitada.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_pecas_laser.sql
git commit -m "feat(calculador): migration config_chapas + pecas_laser (LA)"
```

---

## Task 2: Tipos do Supabase

**Files:**
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Adicionar os dois blocos de tabela**

Dentro de `Database["public"]["Tables"]`, ao lado de `componentes_montado`, inserir (seguindo o estilo inline existente):

```typescript
      config_chapas: {
        Row: { espessura: number; chapa_codigo: string; area_mm2: number; peso_kg: number };
        Insert: { espessura: number; chapa_codigo: string; area_mm2: number; peso_kg: number };
        Update: Partial<Database["public"]["Tables"]["config_chapas"]["Insert"]>;
        Relationships: [];
      };
      pecas_laser: {
        Row: { produto_mestre_id: string; espessura: number; largura_mm: number; comprimento_mm: number; tempo_corte_seg: number; updated_at: string };
        Insert: { produto_mestre_id: string; espessura: number; largura_mm: number; comprimento_mm: number; tempo_corte_seg?: number; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["pecas_laser"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pecas_laser_produto_mestre_id_fkey";
            columns: ["produto_mestre_id"];
            isOneToOne: true;
            referencedRelation: "produtos_mestre";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pecas_laser_espessura_fkey";
            columns: ["espessura"];
            isOneToOne: false;
            referencedRelation: "config_chapas";
            referencedColumns: ["espessura"];
          },
        ];
      };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(calculador): tipos config_chapas e pecas_laser"
```

---

## Task 3: Cálculo puro `laserCost.ts` (TDD)

**Files:**
- Create: `src/lib/laserCost.ts`
- Test: `src/lib/__tests__/laserCost.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from "vitest";
import { calcularCustoPecaLaser } from "@/lib/laserCost";

describe("calcularCustoPecaLaser", () => {
  it("exemplo do spec: 200x300mm, chapa 1,2mm (3.6M/34kg), R$10/kg, 90s, R$120/h", () => {
    const r = calcularCustoPecaLaser({
      larguraMm: 200,
      comprimentoMm: 300,
      tempoSeg: 90,
      areaChapaMm2: 3_600_000,
      pesoChapaKg: 34,
      rkgChapa: 10,
      valorHoraLaser: 120,
    });
    expect(r.areaPecaMm2).toBe(60_000);
    expect(r.valorChapa).toBeCloseTo(340, 6);
    expect(r.custoMaterial).toBeCloseTo(5.6667, 3);
    expect(r.custoLaser).toBeCloseTo(3, 6);
    expect(r.custoUnitario).toBeCloseTo(8.6667, 3);
  });

  it("tempo zero → custo laser zero", () => {
    const r = calcularCustoPecaLaser({
      larguraMm: 100, comprimentoMm: 100, tempoSeg: 0,
      areaChapaMm2: 4_500_000, pesoChapaKg: 169, rkgChapa: 5, valorHoraLaser: 120,
    });
    expect(r.custoLaser).toBe(0);
    expect(r.custoUnitario).toBeCloseTo(r.custoMaterial, 6);
  });

  it("rkg zero → material zero (chapa sem custo na nota)", () => {
    const r = calcularCustoPecaLaser({
      larguraMm: 200, comprimentoMm: 300, tempoSeg: 90,
      areaChapaMm2: 3_600_000, pesoChapaKg: 34, rkgChapa: 0, valorHoraLaser: 120,
    });
    expect(r.custoMaterial).toBe(0);
    expect(r.custoUnitario).toBeCloseTo(3, 6);
  });

  it("área de chapa inválida (0) → material zero, sem divisão por zero", () => {
    const r = calcularCustoPecaLaser({
      larguraMm: 200, comprimentoMm: 300, tempoSeg: 0,
      areaChapaMm2: 0, pesoChapaKg: 34, rkgChapa: 10, valorHoraLaser: 120,
    });
    expect(Number.isFinite(r.custoMaterial)).toBe(true);
    expect(r.custoMaterial).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/__tests__/laserCost.test.ts`
Expected: FAIL — `calcularCustoPecaLaser` não existe.

- [ ] **Step 3: Implementar o mínimo**

```typescript
export interface LaserCostInput {
  larguraMm: number;
  comprimentoMm: number;
  tempoSeg: number;
  areaChapaMm2: number;
  pesoChapaKg: number;
  /** R$/kg da chapa (maior custo da nota nos 3 meses). 0 quando não há nota. */
  rkgChapa: number;
  valorHoraLaser: number;
}

export interface LaserCostResult {
  areaPecaMm2: number;
  fracao: number;       // área peça / área chapa
  percentual: number;   // fração × 100
  valorChapa: number;   // R$/kg × peso da chapa
  custoMaterial: number;
  custoLaser: number;
  custoUnitario: number;
}

/**
 * Custo unitário de uma peça LA cortada a laser.
 * material = (área_peça / área_chapa) × (R$/kg × peso_chapa)
 * laser    = (tempo_seg / 3600) × valor_hora_laser
 */
export function calcularCustoPecaLaser(i: LaserCostInput): LaserCostResult {
  const areaPecaMm2 = i.larguraMm * i.comprimentoMm;
  const fracao = i.areaChapaMm2 > 0 ? areaPecaMm2 / i.areaChapaMm2 : 0;
  const valorChapa = i.rkgChapa * i.pesoChapaKg;
  const custoMaterial = fracao * valorChapa;
  const custoLaser =
    i.tempoSeg > 0 && i.valorHoraLaser > 0 ? (i.tempoSeg / 3600) * i.valorHoraLaser : 0;
  return {
    areaPecaMm2,
    fracao,
    percentual: fracao * 100,
    valorChapa,
    custoMaterial,
    custoLaser,
    custoUnitario: custoMaterial + custoLaser,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/__tests__/laserCost.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/laserCost.ts src/lib/__tests__/laserCost.test.ts
git commit -m "feat(calculador): calculo puro do custo da peca LA (material + laser)"
```

---

## Task 4: Repositórios

**Files:**
- Create: `src/repositories/configChapasRepo.ts`
- Create: `src/repositories/pecasLaserRepo.ts`

- [ ] **Step 1: `configChapasRepo.ts`**

```typescript
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ConfigChapa = Database["public"]["Tables"]["config_chapas"]["Row"];

function dbErr(error: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(parts.join(" — ") || "erro no banco");
}

export async function listConfigChapas(): Promise<ConfigChapa[]> {
  const { data, error } = await supabase.from("config_chapas").select("*").order("espessura");
  if (error) throw dbErr(error);
  return data ?? [];
}
```

- [ ] **Step 2: `pecasLaserRepo.ts`**

```typescript
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PecaLaser = Database["public"]["Tables"]["pecas_laser"]["Row"];
type Insert = Database["public"]["Tables"]["pecas_laser"]["Insert"];

function dbErr(error: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(parts.join(" — ") || "erro no banco");
}

export async function listPecasLaser(): Promise<PecaLaser[]> {
  const { data, error } = await supabase.from("pecas_laser").select("*");
  if (error) throw dbErr(error);
  return data ?? [];
}

export async function getPecaLaser(produtoId: string): Promise<PecaLaser | null> {
  const { data, error } = await supabase
    .from("pecas_laser")
    .select("*")
    .eq("produto_mestre_id", produtoId)
    .maybeSingle();
  if (error) throw dbErr(error);
  return data ?? null;
}

export async function upsertPecaLaser(spec: Insert): Promise<void> {
  const { error } = await supabase
    .from("pecas_laser")
    .upsert({ ...spec, updated_at: new Date().toISOString() }, { onConflict: "produto_mestre_id" });
  if (error) throw dbErr(error);
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add src/repositories/configChapasRepo.ts src/repositories/pecasLaserRepo.ts
git commit -m "feat(calculador): repositorios config_chapas e pecas_laser"
```

---

## Task 5: Override do custo das peças LA na resolução

**Files:**
- Modify: `src/hooks/useProdutosResolvidos.ts`

- [ ] **Step 1: Importar repos e o cálculo**

No topo de `useProdutosResolvidos.ts`, adicionar:

```typescript
import { listConfigChapas } from "@/repositories/configChapasRepo";
import { listPecasLaser } from "@/repositories/pecasLaserRepo";
import { calcularCustoPecaLaser } from "@/lib/laserCost";
```

- [ ] **Step 2: Carregar as novas queries**

Trocar o `Promise.all` (linhas ~33-35) por:

```typescript
      const [mestres, itens, cfg, componentes, vinculos, chapas, pecasLaser] = await Promise.all([
        listProdutosMestre(), listItensComData(), getConfig(), listComponentes(), listVinculos(),
        listConfigChapas(), listPecasLaser(),
      ]);
```

- [ ] **Step 3: Sobrescrever o custo das peças LA antes da recursão**

Logo **após** o loop que preenche `custoCompradoPorId`/`custoNotaPorId` (após a linha ~73, antes de montar `compPorMontado`), inserir:

```typescript
      // Peças LA (chapa laser): custo = material da chapa (R$/kg das notas × peso × % da peça)
      // + corte laser. Sobrescreve o custo do comprado; a recursão de montados já lê este mapa.
      if (pecasLaser.length > 0) {
        const idPorCodigo = new Map<string, string>();
        for (const m of mestres) if (m.codigo) idPorCodigo.set(m.codigo.trim().toUpperCase(), m.id);
        const chapaPorEspessura = new Map(chapas.map((c) => [Number(c.espessura), c]));
        for (const peca of pecasLaser) {
          const chapa = chapaPorEspessura.get(Number(peca.espessura));
          if (!chapa) continue;
          const chapaId = idPorCodigo.get(chapa.chapa_codigo.trim().toUpperCase());
          const rkgChapa = (chapaId ? custoCompradoPorId.get(chapaId) : null) ?? 0;
          const r = calcularCustoPecaLaser({
            larguraMm: Number(peca.largura_mm),
            comprimentoMm: Number(peca.comprimento_mm),
            tempoSeg: Number(peca.tempo_corte_seg),
            areaChapaMm2: Number(chapa.area_mm2),
            pesoChapaKg: Number(chapa.peso_kg),
            rkgChapa,
            valorHoraLaser: cfg.valorHoraLaser,
          });
          custoCompradoPorId.set(peca.produto_mestre_id, r.custoUnitario);
        }
      }
```

- [ ] **Step 4: Type-check + verificar que nada quebrou**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros de tipo; testes existentes continuam passando.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProdutosResolvidos.ts
git commit -m "feat(calculador): custo das pecas LA sobrescreve o comprado e flui pros montados"
```

---

## Task 6: Página Calculador + rota + menu

**Files:**
- Create: `src/pages/Calculador.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: Criar `src/pages/Calculador.tsx`**

```tsx
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProdutosResolvidos } from "@/hooks/useProdutosResolvidos";
import { listConfigChapas } from "@/repositories/configChapasRepo";
import { getPecaLaser, upsertPecaLaser } from "@/repositories/pecasLaserRepo";
import { getConfig } from "@/repositories/configRepo";
import { calcularCustoPecaLaser } from "@/lib/laserCost";
import { formatCurrency } from "@/lib/pricing";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "erro desconhecido";
}
function parseNum(v: string): number {
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalize(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function Calculador() {
  const queryClient = useQueryClient();
  const produtosQuery = useProdutosResolvidos();
  const chapasQuery = useQuery({ queryKey: ["config-chapas"], queryFn: listConfigChapas });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: getConfig });

  const [pecaId, setPecaId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [espessura, setEspessura] = useState<number | null>(null);
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [tempo, setTempo] = useState("");
  const [busy, setBusy] = useState(false);

  const linhas = produtosQuery.data ?? [];
  const chapas = chapasQuery.data ?? [];

  const peca = linhas.find((l) => l.id === pecaId) ?? null;

  // Carrega receita existente ao selecionar a peça.
  useEffect(() => {
    if (!pecaId) return;
    void (async () => {
      const spec = await getPecaLaser(pecaId);
      if (spec) {
        setEspessura(Number(spec.espessura));
        setLargura(String(Number(spec.largura_mm)));
        setComprimento(String(Number(spec.comprimento_mm)));
        setTempo(String(Number(spec.tempo_corte_seg)));
      } else {
        setEspessura(null); setLargura(""); setComprimento(""); setTempo("");
      }
    })();
  }, [pecaId]);

  const resultados = useMemo(() => {
    const q = normalize(busca.trim());
    if (!q) return [];
    return linhas
      .filter((l) => normalize(`${l.codigo ?? ""} ${l.nome}`).includes(q))
      .slice(0, 8);
  }, [linhas, busca]);

  const chapa = chapas.find((c) => Number(c.espessura) === espessura) ?? null;
  const rkgChapa = useMemo(() => {
    if (!chapa) return 0;
    const cod = chapa.chapa_codigo.trim().toUpperCase();
    const prod = linhas.find((l) => (l.codigo ?? "").trim().toUpperCase() === cod);
    return prod?.resolvido.custoBase ?? 0;
  }, [chapa, linhas]);

  const calc = useMemo(() => {
    if (!chapa) return null;
    return calcularCustoPecaLaser({
      larguraMm: parseNum(largura),
      comprimentoMm: parseNum(comprimento),
      tempoSeg: parseNum(tempo),
      areaChapaMm2: Number(chapa.area_mm2),
      pesoChapaKg: Number(chapa.peso_kg),
      rkgChapa,
      valorHoraLaser: configQuery.data?.valorHoraLaser ?? 0,
    });
  }, [chapa, largura, comprimento, tempo, rkgChapa, configQuery.data]);

  const salvar = async () => {
    if (!pecaId) { toast.error("Selecione a peça."); return; }
    if (espessura == null) { toast.error("Escolha a espessura."); return; }
    if (parseNum(largura) <= 0 || parseNum(comprimento) <= 0) {
      toast.error("Informe largura e comprimento."); return;
    }
    setBusy(true);
    try {
      await upsertPecaLaser({
        produto_mestre_id: pecaId,
        espessura,
        largura_mm: parseNum(largura),
        comprimento_mm: parseNum(comprimento),
        tempo_corte_seg: parseNum(tempo),
      });
      queryClient.invalidateQueries({ queryKey: ["produtos-resolvidos"] });
      toast.success("Custo da peça salvo. Atualiza sozinho com novas notas da chapa.");
    } catch (err) {
      toast.error(`Falha ao salvar: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calculador de peças (LA)</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Custo de peças de chapa cortadas a laser: material (% da chapa × R$/kg das notas × peso)
          + tempo de laser. O custo fica salvo na peça e se atualiza sozinho com novas notas.
        </p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Peça e medidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative flex flex-col gap-1.5">
            <Label>Peça</Label>
            {peca ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span><span className="font-medium">{peca.nome}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{peca.codigo ?? ""}</span></span>
                <Button variant="ghost" size="sm" onClick={() => { setPecaId(null); setBusca(""); }}>Trocar</Button>
              </div>
            ) : (
              <>
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar peça LA (código ou nome)…" />
                {busca.trim() && resultados.length > 0 && (
                  <ul className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg">
                    {resultados.map((l) => (
                      <li key={l.id}>
                        <button type="button" onClick={() => { setPecaId(l.id); setBusca(""); }}
                          className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
                          <span className="font-medium">{l.nome}</span>
                          <span className="font-mono-num text-[11px] text-muted-foreground">{l.codigo ?? "—"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label>Espessura</Label>
              <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={espessura ?? ""} onChange={(e) => setEspessura(e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {chapas.map((c) => (
                  <option key={String(c.espessura)} value={Number(c.espessura)}>
                    {String(c.espessura).replace(".", ",")} mm
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Largura (mm)</Label>
              <Input type="number" min="0" step="0.01" value={largura} onChange={(e) => setLargura(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Comprimento (mm)</Label>
              <Input type="number" min="0" step="0.01" value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tempo de corte (s)</Label>
              <Input type="number" min="0" step="0.1" value={tempo} onChange={(e) => setTempo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {calc && chapa && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Custo da peça</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Área da peça" value={`${calc.areaPecaMm2.toLocaleString("pt-BR")} mm²`} />
            <Row label="% da chapa usada" value={`${calc.percentual.toFixed(3)} %`} />
            <Row label={`R$/kg da chapa (${chapa.chapa_codigo})`} value={rkgChapa > 0 ? formatCurrency(rkgChapa) : "sem custo na nota"} />
            <Row label="Valor da chapa" value={formatCurrency(calc.valorChapa)} />
            <Row label="Custo do material" value={formatCurrency(calc.custoMaterial)} />
            <Row label="Custo do laser" value={formatCurrency(calc.custoLaser)} />
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Custo unitário</span>
              <span className="font-mono-num">{formatCurrency(calc.custoUnitario)}</span>
            </div>
            {rkgChapa === 0 && (
              <p className="text-xs text-amber-600">Chapa sem custo nas notas dos últimos 3 meses — importe a nota da chapa.</p>
            )}
            {(configQuery.data?.valorHoraLaser ?? 0) === 0 && (
              <p className="text-xs text-amber-600">Valor da hora do laser está 0 — configure em Configurações.</p>
            )}
            <div className="mt-2">
              <Button onClick={() => void salvar()} disabled={busy || !pecaId}>
                {busy ? "Salvando…" : "Salvar custo na peça"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-num">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Registrar a rota em `src/App.tsx`**

Adicionar o import junto dos outros (após `ProdutoMontado`):
```typescript
import Calculador from "@/pages/Calculador";
```
E a rota dentro do bloco do `AppLayout` (após a rota `/montado`):
```tsx
                <Route path="/calculador" element={<Calculador />} />
```

- [ ] **Step 3: Adicionar o item de menu em `src/components/AppLayout.tsx`**

No array `links`, após `{ to: "/montado", label: "Produto montado" }`:
```typescript
  { to: "/calculador", label: "Calculador" },
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Calculador.tsx src/App.tsx src/components/AppLayout.tsx
git commit -m "feat(calculador): pagina /calculador (LA) com calculo ao vivo e salvar"
```

---

## Task 7: Deploy

- [ ] **Step 1: Garantir que a migration 0011 foi aplicada no banco de produção** (Supabase do projeto). Sem isso o app quebra ao consultar `config_chapas`/`pecas_laser`.

- [ ] **Step 2: Deploy do frontend**

Run: `bash deploy.sh`
Expected: `✓ Deploy: https://precos.liveuni.com.br`.

- [ ] **Step 3: Validar em produção**

Abrir `/calculador`, selecionar uma peça LA, escolher 1,2mm, largura/comprimento/tempo, conferir o detalhamento e salvar. Conferir que o custo aparece no produto e nos montados que a usam.

---

## Notas / fora de escopo
- A função SQL `api_precos` (API externa) **não** considera o custo material das peças LA. A UI usa `useProdutosResolvidos` (cliente), que considera. Atualizar `api_precos` é follow-up se a API externa precisar refletir o custo LA.
- Espessuras 1,5mm e 12,7mm: adicionar linhas em `config_chapas` quando houver chapa/peso.
- TB e US: fases seguintes, fórmulas a definir.
