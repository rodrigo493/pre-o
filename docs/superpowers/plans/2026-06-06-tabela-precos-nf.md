# Tabela de Preços a partir de NF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ferramenta web onde o usuário joga NFs (XML/PDF), o sistema extrai produtos com custo, aplica markup fiscal sobre o **maior custo dos últimos 3 meses** e gera uma tabela de preços de venda consultável, com produtos montados e override manual de preço.

**Architecture:** SPA React+Vite+TS (mesma base do `cost-to-love`, reusando `pricing.ts` e `parsers.ts`). Lógica de domínio pura e testada (markup, resolução de preço dos 3 meses, auto-vínculo). Persistência no Supabase (projeto novo) atrás de uma camada de repositórios. Deploy estático via nginx+Docker+Traefik na VPS Live em `precos.liveuni.com.br`.

**Tech Stack:** React 18, Vite 5, TypeScript 5, TailwindCSS 3, shadcn/ui, @tanstack/react-query, react-router-dom, @supabase/supabase-js, pdfjs-dist, xlsx, date-fns, zod, react-hook-form, Vitest (jsdom).

**Referência de código a portar (NÃO reinventar):**
- `C:\VS_CODE\Calculador de custo\cost-to-love\src\lib\pricing.ts`
- `C:\VS_CODE\Calculador de custo\cost-to-love\src\lib\__tests__\pricing.test.ts`
- `C:\VS_CODE\Calculador de custo\cost-to-love\src\lib\parsers.ts`
- `C:\VS_CODE\Calculador de custo\cost-to-love\src\integrations\supabase\client.ts`
- `C:\VS_CODE\Calculador de custo\cost-to-love\{docker-stack.yml,nginx,deploy.sh,vite.config.ts,vitest.config.ts}`

**Segurança de dependências:** todas as deps são fixadas na MESMA versão que o `cost-to-love` já usa (todas publicadas há meses — satisfazem o cooldown de 7 dias). Usar `--save-exact`. Nunca commitar `.env`. `service_role` jamais no front-end.

---

## Alterações pós-design (durante a execução)

Decisões/correções que divergiram do design original e já estão implementadas:

1. **Frete REMOVIDO.** O "preço de venda" passou a ser **base + IPI** (`precoComIPI`), sem frete. O campo de frete saiu de Configurações e da lógica; `resolvePrice` não recebe mais `frete`. A coluna `config_markup.frete` permanece inerte no banco (sem uso, não requer migração). `pricing.ts` segue intacto (portado).
2. **`PriceStatus` ganhou `"sem_preco_manual"`** (montado sem preço manual) — distinto de `"sem_custo_recente"` (comprado sem custo recente). `PriceBadge` trata os 4 status exaustivamente.
3. **Janela dos 3 meses timezone-safe:** `itensNaJanela` normaliza os dois lados com `startOfDay` (corrige borda em servidor UTC).
4. **Tipos Supabase exigem `Relationships`** em cada tabela (senão postgrest-js degrada tudo para `never`).
5. **Deploy com remontagem forçada:** `deploy.sh` faz staging + swap + `docker service update --force` (fazer `rm -rf` na pasta bind-mounted de um container rodando quebra o mount → 403).
6. **Bugs corrigidos no review final:** toast de erro movido para `useEffect` (evita loop), `busyId` em `finally`, remoção de invalidação morta `["itens"]`.

**NO AR:** `https://precos.liveuni.com.br` (Supabase projeto `idttiidpqsxvpfcfjefx`).

**Follow-ups conhecidos (não bloqueantes):** `xlsx@0.18.5` tem CVE sem fix (uso só de escrita — baixo risco); `react-router-dom` 6.30.1→6.30.4 (patch de XSS, aplicar via protocolo de deps); bundle `index.js` ~297kB gzip (code-split/manualChunks); adicionar CSP no nginx; `parsers.ts` perto do limite de 800 linhas (split futuro).

---

## File Structure

```
live-precos/
├── index.html
├── package.json                      # deps fixadas (exact)
├── vite.config.ts                    # alias @ + porta 8080
├── vitest.config.ts                  # jsdom + alias @
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── components.json                   # shadcn
├── .env.example                      # VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
├── .gitignore                        # já existe; garantir .env*
├── nginx/precos.liveuni.com.br.conf
├── docker-stack.yml
├── deploy.sh
├── supabase/
│   └── migrations/
│       └── 0001_init.sql             # tabelas + RLS
├── src/
│   ├── main.tsx
│   ├── App.tsx                       # router + providers
│   ├── index.css
│   ├── lib/
│   │   ├── pricing.ts                # PORTADO
│   │   ├── parsers.ts                # PORTADO (subset NF)
│   │   ├── priceResolution.ts        # NOVO — regra dos 3 meses + override + montado
│   │   ├── autoLink.ts               # NOVO — cprod → mestre
│   │   ├── markupConfig.ts           # NOVO — map snake_case DB ↔ PricingPercentages
│   │   ├── exportXlsx.ts             # NOVO — exporta tabela p/ .xlsx
│   │   └── utils.ts                  # cn() shadcn
│   ├── lib/__tests__/
│   │   ├── pricing.test.ts           # PORTADO
│   │   ├── parsers.test.ts           # NOVO — fixtures NF
│   │   ├── priceResolution.test.ts   # NOVO
│   │   ├── autoLink.test.ts          # NOVO
│   │   └── markupConfig.test.ts      # NOVO
│   ├── lib/__tests__/fixtures/
│   │   └── nfe-exemplo.xml           # fixture NF-e real (anonimizada)
│   ├── integrations/supabase/
│   │   ├── client.ts                 # PORTADO
│   │   └── types.ts                  # Database types (escrito à mão)
│   ├── repositories/
│   │   ├── notasRepo.ts
│   │   ├── itensNotaRepo.ts
│   │   ├── produtosMestreRepo.ts
│   │   ├── vinculosRepo.ts
│   │   └── configRepo.ts
│   ├── hooks/
│   │   ├── useAuth.tsx
│   │   └── useProdutosResolvidos.ts  # junta itens+config → preços resolvidos
│   ├── components/
│   │   ├── ui/                        # shadcn (button, input, table, dialog, ...)
│   │   ├── ProtectedRoute.tsx
│   │   ├── AppLayout.tsx             # nav lateral
│   │   ├── ImportDropzone.tsx
│   │   ├── ImportPreviewTable.tsx
│   │   └── PriceBadge.tsx
│   └── pages/
│       ├── Login.tsx
│       ├── Importar.tsx
│       ├── Vincular.tsx
│       ├── Produtos.tsx
│       ├── ProdutoMontado.tsx
│       └── Configuracoes.tsx
```

---

## Phase 0 — Scaffold & Tooling

### Task 0.1: Inicializar projeto Vite React-TS + tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `components.json`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Criar `package.json` com deps fixadas (exact)**

Copiar a lista de versões EXATAS do `cost-to-love/package.json` (já inspecionada). Remover o `^` de todas. Subset mínimo necessário:

```json
{
  "name": "live-precos",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hookform/resolvers": "3.10.0",
    "@radix-ui/react-dialog": "1.1.14",
    "@radix-ui/react-label": "2.1.7",
    "@radix-ui/react-select": "2.2.5",
    "@radix-ui/react-slot": "1.2.3",
    "@radix-ui/react-tabs": "1.1.12",
    "@radix-ui/react-toast": "1.2.14",
    "@radix-ui/react-tooltip": "1.2.7",
    "@supabase/supabase-js": "2.100.1",
    "@tanstack/react-query": "5.83.0",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "date-fns": "3.6.0",
    "lucide-react": "0.462.0",
    "pdfjs-dist": "5.5.207",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-hook-form": "7.61.1",
    "react-router-dom": "6.30.1",
    "sonner": "1.7.4",
    "tailwind-merge": "2.6.0",
    "tailwindcss-animate": "1.0.7",
    "xlsx": "0.18.5",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.6.0",
    "@testing-library/react": "16.0.0",
    "@types/node": "22.16.5",
    "@types/react": "18.3.23",
    "@types/react-dom": "18.3.7",
    "@vitejs/plugin-react-swc": "3.11.0",
    "autoprefixer": "10.4.21",
    "eslint": "9.32.0",
    "jsdom": "20.0.3",
    "postcss": "8.5.6",
    "tailwindcss": "3.4.17",
    "typescript": "5.8.3",
    "vite": "5.4.19",
    "vitest": "3.2.4"
  }
}
```

- [ ] **Step 2: Instalar deps (protocolo de segurança)**

Antes de instalar: as versões acima são idênticas às já em produção no `cost-to-love` (publicadas há meses → cooldown 7 dias OK). Rodar dry-run primeiro.

Run:
```
npm install --dry-run
```
Expected: lista de pacotes, sem erros. Depois:
```
npm install --save-exact
```
Expected: cria `node_modules/` e `package-lock.json`. **Não deletar o lockfile depois.**

- [ ] **Step 3: Criar configs (copiar do cost-to-love, ajustando nome)**

`vite.config.ts` (sem `lovable-tagger`, que é exclusivo do cost-to-love):
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: { host: "::", port: 8080, hmr: { overlay: false } },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
```

`vitest.config.ts` (idêntico ao cost-to-love):
```ts
import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  test: { environment: "jsdom", globals: true, setupFiles: [] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }],
  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } }
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020", "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"], "module": "ESNext",
    "skipLibCheck": true, "moduleResolution": "bundler",
    "allowImportingTsExtensions": true, "resolveJsonModule": true,
    "isolatedModules": true, "noEmit": true, "jsx": "react-jsx",
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".", "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2023"], "module": "ESNext",
    "skipLibCheck": true, "moduleResolution": "bundler",
    "allowImportingTsExtensions": true, "isolatedModules": true,
    "noEmit": true, "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))", input: "hsl(var(--input))",
        ring: "hsl(var(--ring))", background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

`index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tabela de Preços — Live</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`components.json` (shadcn):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default", "rsc": false, "tsx": true,
  "tailwind": { "config": "tailwind.config.ts", "css": "src/index.css", "baseColor": "slate", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils" }
}
```

`.env.example`:
```
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_ANON_KEY
```

- [ ] **Step 4: Garantir `.env*` no `.gitignore`**

Adicionar ao `.gitignore` (se ainda não estiver):
```
node_modules
dist
.env
.env.*
!.env.example
```

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "chore: scaffold vite react-ts + tooling com deps fixadas"
```

---

### Task 0.2: Base do app (CSS, entrypoint, utils, shadcn ui base)

**Files:**
- Create: `src/index.css`, `src/main.tsx`, `src/App.tsx`, `src/lib/utils.ts`
- Create (shadcn): `src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `table.tsx`, `card.tsx`, `dialog.tsx`, `select.tsx`, `tabs.tsx`, `sonner.tsx`, `tooltip.tsx`

- [ ] **Step 1: `src/lib/utils.ts`**
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 2: `src/index.css` (tokens shadcn slate)**

Copiar o bloco `:root`/`.dark` padrão do shadcn (variáveis `--background`, `--foreground`, `--primary`, etc.) + `@tailwind base; @tailwind components; @tailwind utilities;`. Pode copiar de `cost-to-love/src/index.css` o cabeçalho de tokens. Acrescentar regra de print no fim (usada no export PDF):
```css
@media print {
  body * { visibility: hidden; }
  #print-area, #print-area * { visibility: visible; }
  #print-area { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
}
```

- [ ] **Step 3: `src/main.tsx`**
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
```

- [ ] **Step 4: `src/App.tsx` (router + providers placeholder)**
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<div className="p-8 text-2xl">Tabela de Preços — Live (scaffold OK)</div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: Adicionar componentes shadcn base**

Para cada componente listado, copiar o arquivo correspondente de `cost-to-love/src/components/ui/`. Eles dependem só de `@/lib/utils` e dos `@radix-ui/*` já instalados. (Copiar evita o `npx shadcn add`, que baixa código remoto.)

- [ ] **Step 6: Rodar o dev e confirmar que sobe**

Run: `npm run dev`
Expected: Vite sobe em `http://localhost:8080`, página mostra "scaffold OK". Encerrar com Ctrl+C.

- [ ] **Step 7: Confirmar que os testes rodam (ainda 0 testes)**

Run: `npm test`
Expected: Vitest roda, "no test files" (exit 0) — confirma que a config funciona.

- [ ] **Step 8: Commit**
```bash
git add -A
git commit -m "feat: base do app (router, providers, shadcn ui, print css)"
```

---

## Phase 1 — Lógica de Domínio (pura, TDD)

### Task 1.1: Portar motor de markup (`pricing.ts`) + testes

**Files:**
- Create: `src/lib/pricing.ts`
- Test: `src/lib/__tests__/pricing.test.ts`

- [ ] **Step 1: Escrever o teste primeiro (portar `pricing.test.ts` verbatim)**

Copiar EXATAMENTE o conteúdo de `cost-to-love/src/lib/__tests__/pricing.test.ts` (5 casos: defaults PIS/COFINS; ICMS sobre PV+IPI ≈1246.88; sem IPI ≈1219.51; gross-up lucro ≈1434.78; erro divisor≤0). Import: `import { calculateSellingPrice, defaultPercentages } from "@/lib/pricing";`

- [ ] **Step 2: Rodar o teste — deve FALHAR**

Run: `npm test -- pricing`
Expected: FAIL — `Cannot find module '@/lib/pricing'`.

- [ ] **Step 3: Implementar `pricing.ts` (portar verbatim)**

Copiar EXATAMENTE o conteúdo de `cost-to-love/src/lib/pricing.ts` (interface `PricingPercentages`, `defaultPercentages`, `percentageLabels`, `calculateSellingPrice`, `formatCurrency`, `generateId`). Lógica do divisor portada sem alteração.

- [ ] **Step 4: Rodar o teste — deve PASSAR**

Run: `npm test -- pricing`
Expected: PASS, 5 testes verdes.

- [ ] **Step 5: Commit**
```bash
git add src/lib/pricing.ts src/lib/__tests__/pricing.test.ts
git commit -m "feat: portar motor de markup (pricing.ts) com testes"
```

---

### Task 1.2: Portar parser de NF (`parsers.ts`, subset NF) + testes com fixture

**Files:**
- Create: `src/lib/parsers.ts`
- Create: `src/lib/__tests__/fixtures/nfe-exemplo.xml`
- Test: `src/lib/__tests__/parsers.test.ts`

- [ ] **Step 1: Criar a fixture de NF-e**

Criar `src/lib/__tests__/fixtures/nfe-exemplo.xml` com uma NF-e mínima válida (anonimizada) com 2 itens:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe>
    <ide><nNF>12345</nNF><dhEmi>2026-03-15T10:30:00-03:00</dhEmi></ide>
    <emit><xNome>FORNECEDOR EXEMPLO LTDA</xNome></emit>
    <det nItem="1"><prod>
      <cProd>ABC-001</cProd><xProd>PARAFUSO SEXTAVADO M8</xProd>
      <uCom>UN</uCom><qCom>100.0000</qCom><vUnCom>2.5000</vUnCom>
    </prod></det>
    <det nItem="2"><prod>
      <cProd>ABC-002</cProd><xProd>CHAPA ACO 2MM</xProd>
      <uCom>KG</uCom><qCom>50.0000</qCom><vUnCom>18.9000</vUnCom>
    </prod></det>
  </infNFe></NFe>
</nfeProc>
```

- [ ] **Step 2: Escrever o teste primeiro**

`src/lib/__tests__/parsers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseInvoiceFromXML } from "@/lib/parsers";

const xml = readFileSync(
  resolve(__dirname, "fixtures/nfe-exemplo.xml"), "utf-8"
);

describe("parseInvoiceFromXML — NF-e", () => {
  it("extrai os 2 itens com código, descrição e custo unitário", () => {
    const items = parseInvoiceFromXML(xml);
    expect(items).toHaveLength(2);
    const p1 = items[0];
    expect(p1.code).toBe("ABC-001");
    expect(p1.description).toBe("PARAFUSO SEXTAVADO M8");
    expect(p1.unitPrice).toBeCloseTo(2.5, 4);
    expect(p1.quantity).toBeCloseTo(100, 4);
    expect(p1.unit).toBe("UN");
  });

  it("extrai data de emissão e fornecedor", () => {
    const items = parseInvoiceFromXML(xml);
    expect(items[0].emissionDate).toBe("2026-03-15");
    expect(items[0].supplier).toBe("FORNECEDOR EXEMPLO LTDA");
  });

  it("descarta item sem preço (>0)", () => {
    const semPreco = xml.replace("<vUnCom>2.5000</vUnCom>", "<vUnCom>0</vUnCom>");
    const items = parseInvoiceFromXML(semPreco);
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe("ABC-002");
  });
});
```

- [ ] **Step 3: Rodar o teste — deve FALHAR**

Run: `npm test -- parsers`
Expected: FAIL — `Cannot find module '@/lib/parsers'`.

- [ ] **Step 4: Implementar `parsers.ts` (portar subset NF)**

Copiar de `cost-to-love/src/lib/parsers.ts` APENAS o que a ferramenta usa (descartar BOM e Excel-BOM). Exports a manter:
- `interface InvoiceItem`
- helpers privados: `parseBRNumber`, `isNumericToken`, `normalizeInvoiceUnit`, `normalizeInvoiceDescription`, `appendInvoiceDescription`, `isInvoiceDescriptionContinuation`, `extractEmissionDateFromText`, `extractSupplierFromText`, `parseInvoiceFromPdf24Html`
- `parseInvoiceFromXML`, `parseInvoiceFromText`, `parseInvoiceFromPositionedItems`
- `interface PDFTextItem`, `extractTextFromPDF`, `extractPositionedTextFromPDF`, `ensurePdfJsReady`, `clonePdfData`, `initPdfJs`
- `readFileAsArrayBuffer`, `readFileAsText`

Remover: `import * as XLSX`, `BOMItem`, `isAssemblyCode`, `isValidMaterialCode`, `parseBOMFromExcel`, `parseBOMFromText`, `parseBOMFromPositionedItems`, `parseInvoiceFromExcel`. (Copiar o resto VERBATIM — não reescrever a lógica de parsing.)

- [ ] **Step 5: Rodar o teste — deve PASSAR**

Run: `npm test -- parsers`
Expected: PASS, 3 testes verdes.

- [ ] **Step 6: Commit**
```bash
git add src/lib/parsers.ts src/lib/__tests__/parsers.test.ts src/lib/__tests__/fixtures/
git commit -m "feat: portar parser de NF (XML/PDF) com fixture e testes"
```

---

### Task 1.3: Motor de resolução de preço (regra dos 3 meses + override + montado)

**Files:**
- Create: `src/lib/priceResolution.ts`
- Test: `src/lib/__tests__/priceResolution.test.ts`

- [ ] **Step 1: Escrever o teste primeiro**

`src/lib/__tests__/priceResolution.test.ts`:
```ts
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
});

describe("resolvePrice — override manual", () => {
  it("preço manual vence o markup em produto comprado", () => {
    const produto: ProdutoMestre = { id: "p1", nome: "X", tipo: "comprado", precoManual: 500 };
    const r = resolvePrice(produto, [item(15, "2026-05-01")], cfg, 0, HOJE);
    expect(r.status).toBe("travado");
    expect(r.precoVenda).toBe(500);
    expect(r.custoBase).toBe(15); // ainda mostra o maior custo p/ margem
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
```

- [ ] **Step 2: Rodar o teste — deve FALHAR**

Run: `npm test -- priceResolution`
Expected: FAIL — `Cannot find module '@/lib/priceResolution'`.

- [ ] **Step 3: Implementar `priceResolution.ts`**

```ts
import { subMonths, parseISO, startOfDay } from "date-fns";
import { calculateSellingPrice, type PricingPercentages } from "@/lib/pricing";

export type ProdutoTipo = "comprado" | "montado";
// "sem_preco_manual" = montado sem preço manual definido (distinto de comprado sem custo recente)
export type PriceStatus = "ok" | "travado" | "sem_custo_recente" | "sem_preco_manual";

export interface ItemNota {
  id: string;
  custoUnitario: number;
  dataEmissao: string;   // ISO yyyy-mm-dd (nota.data_emissao)
  notaId: string;
  notaNumero?: string;
}

export interface ProdutoMestre {
  id: string;
  nome: string;
  categoria?: string | null;
  tipo: ProdutoTipo;
  custoManual?: number | null;
  precoManual?: number | null;
}

export interface PriceOrigem {
  notaId: string;
  notaNumero?: string;
  dataEmissao: string;
}

export interface ResolvedPrice {
  precoVenda: number | null;
  custoBase: number | null;      // maiorCusto (comprado) ou custoManual (montado)
  margemPercent: number | null;  // (preco - custo) / preco * 100
  status: PriceStatus;
  origem: PriceOrigem | null;
  numNotasPeriodo: number;
}

function margem(preco: number | null, custo: number | null): number | null {
  if (preco == null || custo == null || preco <= 0) return null;
  return ((preco - custo) / preco) * 100;
}

/** Itens dentro da janela móvel dos últimos 3 meses (limite inclusivo).
 *  Normaliza os dois lados para start-of-day → timezone-safe (importante em
 *  servidor UTC no Docker/VPS; senão a borda de 3 meses vira por horas). */
function itensNaJanela(itens: ItemNota[], hoje: Date): ItemNota[] {
  const limite = startOfDay(subMonths(startOfDay(hoje), 3));
  return itens.filter((it) => startOfDay(parseISO(it.dataEmissao)) >= limite);
}

export function resolvePrice(
  produto: ProdutoMestre,
  itens: ItemNota[],
  config: PricingPercentages,
  frete: number,
  hoje: Date,
): ResolvedPrice {
  const recentes = itensNaJanela(itens, hoje);
  const maior = recentes.reduce<ItemNota | null>(
    (acc, it) => (acc == null || it.custoUnitario > acc.custoUnitario ? it : acc),
    null,
  );
  const custoComprado = maior?.custoUnitario ?? null;
  const origem: PriceOrigem | null = maior
    ? { notaId: maior.notaId, notaNumero: maior.notaNumero, dataEmissao: maior.dataEmissao }
    : null;

  // 1. Override manual (qualquer tipo)
  if (produto.precoManual != null) {
    const custoBase = produto.tipo === "montado" ? produto.custoManual ?? null : custoComprado;
    return {
      precoVenda: produto.precoManual,
      custoBase,
      margemPercent: margem(produto.precoManual, custoBase),
      status: "travado",
      origem: produto.tipo === "montado" ? null : origem,
      numNotasPeriodo: recentes.length,
    };
  }

  // 2. Montado sem override: preço manual é obrigatório; sem ele → sem_preco_manual
  if (produto.tipo === "montado") {
    return {
      precoVenda: null,
      custoBase: produto.custoManual ?? null,
      margemPercent: null,
      status: "sem_preco_manual",
      origem: null,
      numNotasPeriodo: 0,
    };
  }

  // 3. Comprado: markup sobre o maior custo dos 3 meses
  if (custoComprado == null) {
    return {
      precoVenda: null, custoBase: null, margemPercent: null,
      status: "sem_custo_recente", origem: null, numNotasPeriodo: 0,
    };
  }
  const preco = calculateSellingPrice(custoComprado, config, frete).precoVenda;
  return {
    precoVenda: preco,
    custoBase: custoComprado,
    margemPercent: margem(preco, custoComprado),
    status: "ok",
    origem,
    numNotasPeriodo: recentes.length,
  };
}
```

- [ ] **Step 4: Rodar o teste — deve PASSAR**

Run: `npm test -- priceResolution`
Expected: PASS, todos verdes.

- [ ] **Step 5: Commit**
```bash
git add src/lib/priceResolution.ts src/lib/__tests__/priceResolution.test.ts
git commit -m "feat: motor de resolucao de preco (3 meses, override, montado)"
```

---

### Task 1.4: Auto-vínculo cprod → produto mestre

**Files:**
- Create: `src/lib/autoLink.ts`
- Test: `src/lib/__tests__/autoLink.test.ts`

- [ ] **Step 1: Escrever o teste primeiro**

`src/lib/__tests__/autoLink.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { aplicarAutoVinculo, type Vinculo } from "@/lib/autoLink";

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
```

- [ ] **Step 2: Rodar o teste — deve FALHAR**

Run: `npm test -- autoLink`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `autoLink.ts`**
```ts
export interface Vinculo {
  cprod: string;
  produtoMestreId: string;
}
export interface ItemParaVincular {
  id: string;
  cprod: string;
}
export interface ItemVinculado extends ItemParaVincular {
  produtoMestreId: string;
}
export interface ResultadoAutoVinculo {
  vinculados: ItemVinculado[];
  pendentes: ItemParaVincular[];
}

export function aplicarAutoVinculo(
  itens: ItemParaVincular[],
  vinculos: Vinculo[],
): ResultadoAutoVinculo {
  const mapa = new Map(vinculos.map((v) => [v.cprod.trim().toUpperCase(), v.produtoMestreId]));
  const vinculados: ItemVinculado[] = [];
  const pendentes: ItemParaVincular[] = [];
  for (const it of itens) {
    const mestre = mapa.get(it.cprod.trim().toUpperCase());
    if (mestre) vinculados.push({ ...it, produtoMestreId: mestre });
    else pendentes.push(it);
  }
  return { vinculados, pendentes };
}
```

- [ ] **Step 4: Rodar o teste — deve PASSAR**

Run: `npm test -- autoLink`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/autoLink.ts src/lib/__tests__/autoLink.test.ts
git commit -m "feat: auto-vinculo cprod -> produto mestre"
```

---

### Task 1.5: Map de config de markup (snake_case DB ↔ PricingPercentages)

**Files:**
- Create: `src/lib/markupConfig.ts`
- Test: `src/lib/__tests__/markupConfig.test.ts`

- [ ] **Step 1: Escrever o teste primeiro**

`src/lib/__tests__/markupConfig.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { rowToConfig, configToRow, type ConfigRow } from "@/lib/markupConfig";
import { defaultPercentages } from "@/lib/pricing";

const row: ConfigRow = {
  vendas: 7, marketing: 5, custo_operacional: 20, ipi: 5.2, icms: 18,
  pis: 1.65, cofins: 7.6, csll: 9, ir: 25, lucro: 20, desgaste_maquinas: 0, frete: 0,
};

describe("markupConfig map", () => {
  it("rowToConfig mapeia snake_case → PricingPercentages", () => {
    const { config } = rowToConfig(row);
    expect(config).toEqual(defaultPercentages);
  });
  it("rowToConfig extrai frete separado", () => {
    const { frete } = rowToConfig({ ...row, frete: 12.5 });
    expect(frete).toBe(12.5);
  });
  it("configToRow é o inverso de rowToConfig", () => {
    const r = configToRow(defaultPercentages, 0);
    expect(r).toEqual(row);
  });
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npm test -- markupConfig`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `markupConfig.ts`**
```ts
import type { PricingPercentages } from "@/lib/pricing";

export interface ConfigRow {
  vendas: number; marketing: number; custo_operacional: number;
  ipi: number; icms: number; pis: number; cofins: number;
  csll: number; ir: number; lucro: number; desgaste_maquinas: number;
  frete: number;
}

export function rowToConfig(row: ConfigRow): { config: PricingPercentages; frete: number } {
  return {
    config: {
      vendas: row.vendas, marketing: row.marketing,
      custoOperacional: row.custo_operacional, ipi: row.ipi, icms: row.icms,
      pis: row.pis, cofins: row.cofins, csll: row.csll, ir: row.ir,
      lucro: row.lucro, desgasteMaquinas: row.desgaste_maquinas,
    },
    frete: row.frete,
  };
}

export function configToRow(config: PricingPercentages, frete: number): ConfigRow {
  return {
    vendas: config.vendas, marketing: config.marketing,
    custo_operacional: config.custoOperacional, ipi: config.ipi, icms: config.icms,
    pis: config.pis, cofins: config.cofins, csll: config.csll, ir: config.ir,
    lucro: config.lucro, desgaste_maquinas: config.desgasteMaquinas, frete,
  };
}
```

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `npm test -- markupConfig`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/markupConfig.ts src/lib/__tests__/markupConfig.test.ts
git commit -m "feat: map de config de markup (db snake_case <-> camelCase)"
```

---

## Phase 2 — Camada de Dados (Supabase)

### Task 2.1: Migration SQL (tabelas + RLS)

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 0001_init.sql — Tabela de Preços a partir de NF

create table public.produtos_mestre (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  tipo text not null default 'comprado' check (tipo in ('comprado','montado')),
  custo_manual numeric,
  preco_manual numeric,
  created_at timestamptz not null default now()
);

create table public.notas (
  id uuid primary key default gen_random_uuid(),
  numero text,
  chave text,
  fornecedor text,
  data_emissao date not null,
  origem text not null check (origem in ('xml','pdf')),
  arquivo_nome text,
  created_at timestamptz not null default now()
);

create table public.itens_nota (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas(id) on delete cascade,
  cprod text not null,
  descricao text not null,
  unidade text,
  custo_unitario numeric not null,
  quantidade numeric,
  vicms numeric, vipi numeric, vpis numeric, vcofins numeric,
  produto_mestre_id uuid references public.produtos_mestre(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.itens_nota (produto_mestre_id);
create index on public.itens_nota (cprod);

create table public.vinculos_cprod (
  cprod text primary key,
  produto_mestre_id uuid not null references public.produtos_mestre(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.config_markup (
  id int primary key default 1 check (id = 1),
  vendas numeric not null default 7,
  marketing numeric not null default 5,
  custo_operacional numeric not null default 20,
  ipi numeric not null default 5.2,
  icms numeric not null default 18,
  pis numeric not null default 1.65,
  cofins numeric not null default 7.6,
  csll numeric not null default 9,
  ir numeric not null default 25,
  lucro numeric not null default 20,
  desgaste_maquinas numeric not null default 0,
  frete numeric not null default 0
);
insert into public.config_markup (id) values (1) on conflict do nothing;

-- RLS: tudo exige usuário autenticado
alter table public.produtos_mestre enable row level security;
alter table public.notas enable row level security;
alter table public.itens_nota enable row level security;
alter table public.vinculos_cprod enable row level security;
alter table public.config_markup enable row level security;

do $$
declare t text;
begin
  foreach t in array array['produtos_mestre','notas','itens_nota','vinculos_cprod','config_markup']
  loop
    execute format(
      'create policy "auth_all_%1$s" on public.%1$I for all to authenticated using (true) with check (true);', t
    );
  end loop;
end $$;
```

- [ ] **Step 2: Validar SQL localmente (lint sintático)**

Não há banco local; validar visualmente que: cada tabela tem RLS habilitado, cada uma tem policy `for all to authenticated`, FKs corretas, `config_markup` é singleton (id=1).
A aplicação real roda no Step de provisionamento (Task 4.2). Marcar como revisado.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: schema supabase (tabelas + RLS) para tabela de precos"
```

---

### Task 2.2: Client Supabase + tipos `Database`

**Files:**
- Create: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`

- [ ] **Step 1: `client.ts` (portar do cost-to-love)**

Copiar `cost-to-love/src/integrations/supabase/client.ts` verbatim (usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, `persistSession`, `localStorage`).

- [ ] **Step 2: `types.ts` (Database escrito à mão a partir da migration)**

> **IMPORTANTE (descoberto na Task 2.3):** cada tabela DEVE ter também um campo
> `Relationships: []` (ou com as FKs reais nas tabelas com join). Sem ele, o
> `@supabase/postgrest-js` 2.100.1 não casa o schema e degrada Row/Insert/Update
> para `never`, quebrando TODA query. `itens_nota` e `vinculos_cprod` precisam das
> FKs declaradas (itens_nota.nota_id→notas, itens_nota.produto_mestre_id→produtos_mestre,
> vinculos_cprod.produto_mestre_id→produtos_mestre) para o join `notas!inner(...)` tipar.

```ts
export interface Database {
  public: {
    Tables: {
      produtos_mestre: {
        Row: { id: string; nome: string; categoria: string | null; tipo: "comprado" | "montado"; custo_manual: number | null; preco_manual: number | null; created_at: string };
        Insert: { id?: string; nome: string; categoria?: string | null; tipo?: "comprado" | "montado"; custo_manual?: number | null; preco_manual?: number | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["produtos_mestre"]["Insert"]>;
      };
      notas: {
        Row: { id: string; numero: string | null; chave: string | null; fornecedor: string | null; data_emissao: string; origem: "xml" | "pdf"; arquivo_nome: string | null; created_at: string };
        Insert: { id?: string; numero?: string | null; chave?: string | null; fornecedor?: string | null; data_emissao: string; origem: "xml" | "pdf"; arquivo_nome?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["notas"]["Insert"]>;
      };
      itens_nota: {
        Row: { id: string; nota_id: string; cprod: string; descricao: string; unidade: string | null; custo_unitario: number; quantidade: number | null; vicms: number | null; vipi: number | null; vpis: number | null; vcofins: number | null; produto_mestre_id: string | null; created_at: string };
        Insert: { id?: string; nota_id: string; cprod: string; descricao: string; unidade?: string | null; custo_unitario: number; quantidade?: number | null; vicms?: number | null; vipi?: number | null; vpis?: number | null; vcofins?: number | null; produto_mestre_id?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["itens_nota"]["Insert"]>;
      };
      vinculos_cprod: {
        Row: { cprod: string; produto_mestre_id: string; created_at: string };
        Insert: { cprod: string; produto_mestre_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["vinculos_cprod"]["Insert"]>;
      };
      config_markup: {
        Row: { id: number; vendas: number; marketing: number; custo_operacional: number; ipi: number; icms: number; pis: number; cofins: number; csll: number; ir: number; lucro: number; desgaste_maquinas: number; frete: number };
        Insert: Partial<Database["public"]["Tables"]["config_markup"]["Row"]> & { id?: number };
        Update: Partial<Database["public"]["Tables"]["config_markup"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: sem erros nesses arquivos (pode haver erros de arquivos ainda não criados — focar nos dois novos).

- [ ] **Step 4: Commit**
```bash
git add src/integrations/supabase/
git commit -m "feat: client supabase + tipos Database"
```

---

### Task 2.3: Repositórios (envelope consistente)

**Files:**
- Create: `src/repositories/{notasRepo,itensNotaRepo,produtosMestreRepo,vinculosRepo,configRepo}.ts`

> Padrão: cada função `async` retorna os dados e **lança** em erro (tratado na UI com try/catch + toast). Imutável: nunca mutar argumentos.

- [ ] **Step 1: `produtosMestreRepo.ts`**
```ts
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Tables"]["produtos_mestre"]["Row"];
type Insert = Database["public"]["Tables"]["produtos_mestre"]["Insert"];

export async function listProdutosMestre(): Promise<Row[]> {
  const { data, error } = await supabase.from("produtos_mestre").select("*").order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function createProdutoMestre(input: Insert): Promise<Row> {
  const { data, error } = await supabase.from("produtos_mestre").insert(input).select().single();
  if (error) throw error;
  return data;
}
export async function updateProdutoMestre(id: string, patch: Database["public"]["Tables"]["produtos_mestre"]["Update"]): Promise<Row> {
  const { data, error } = await supabase.from("produtos_mestre").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: `notasRepo.ts` + `itensNotaRepo.ts`**
```ts
// notasRepo.ts
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
type NotaInsert = Database["public"]["Tables"]["notas"]["Insert"];
type NotaRow = Database["public"]["Tables"]["notas"]["Row"];
export async function createNota(input: NotaInsert): Promise<NotaRow> {
  const { data, error } = await supabase.from("notas").insert(input).select().single();
  if (error) throw error;
  return data;
}
```
```ts
// itensNotaRepo.ts
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
type ItemInsert = Database["public"]["Tables"]["itens_nota"]["Insert"];
type ItemRow = Database["public"]["Tables"]["itens_nota"]["Row"];

export async function insertItens(itens: ItemInsert[]): Promise<ItemRow[]> {
  const { data, error } = await supabase.from("itens_nota").insert(itens).select();
  if (error) throw error;
  return data ?? [];
}
/** Itens vinculados a um mestre, com a data de emissão da nota (join). */
export async function listItensComData(): Promise<Array<ItemRow & { data_emissao: string; nota_numero: string | null }>> {
  const { data, error } = await supabase
    .from("itens_nota")
    .select("*, notas!inner(data_emissao, numero)")
    .not("produto_mestre_id", "is", null);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, data_emissao: r.notas.data_emissao, nota_numero: r.notas.numero }));
}
export async function listItensPendentes(): Promise<ItemRow[]> {
  const { data, error } = await supabase.from("itens_nota").select("*").is("produto_mestre_id", null);
  if (error) throw error;
  return data ?? [];
}
export async function vincularItem(id: string, produtoMestreId: string): Promise<void> {
  const { error } = await supabase.from("itens_nota").update({ produto_mestre_id: produtoMestreId }).eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 3: `vinculosRepo.ts` + `configRepo.ts`**
```ts
// vinculosRepo.ts
import { supabase } from "@/integrations/supabase/client";
import type { Vinculo } from "@/lib/autoLink";
export async function listVinculos(): Promise<Vinculo[]> {
  const { data, error } = await supabase.from("vinculos_cprod").select("cprod, produto_mestre_id");
  if (error) throw error;
  return (data ?? []).map((r) => ({ cprod: r.cprod, produtoMestreId: r.produto_mestre_id }));
}
export async function upsertVinculo(cprod: string, produtoMestreId: string): Promise<void> {
  const { error } = await supabase.from("vinculos_cprod")
    .upsert({ cprod: cprod.trim().toUpperCase(), produto_mestre_id: produtoMestreId });
  if (error) throw error;
}
```
```ts
// configRepo.ts
import { supabase } from "@/integrations/supabase/client";
import { rowToConfig, configToRow } from "@/lib/markupConfig";
import type { PricingPercentages } from "@/lib/pricing";
export async function getConfig(): Promise<{ config: PricingPercentages; frete: number }> {
  const { data, error } = await supabase.from("config_markup").select("*").eq("id", 1).single();
  if (error) throw error;
  return rowToConfig(data);
}
export async function saveConfig(config: PricingPercentages, frete: number): Promise<void> {
  const { error } = await supabase.from("config_markup").update(configToRow(config, frete)).eq("id", 1);
  if (error) throw error;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: sem erros nos repositórios.

- [ ] **Step 5: Commit**
```bash
git add src/repositories/
git commit -m "feat: repositorios supabase (notas, itens, mestre, vinculos, config)"
```

---

## Phase 3 — App Shell, Auth e Telas

### Task 3.1: Auth (login + rota protegida)

**Files:**
- Create: `src/hooks/useAuth.tsx`, `src/components/ProtectedRoute.tsx`, `src/components/AppLayout.tsx`, `src/pages/Login.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `useAuth.tsx` (context com sessão Supabase)**
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx { session: Session | null; loading: boolean; signOut: () => Promise<void>; }
const Ctx = createContext<AuthCtx>({ session: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const signOut = async () => { await supabase.auth.signOut(); };
  return <Ctx.Provider value={{ session, loading, signOut }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
```

- [ ] **Step 2: `ProtectedRoute.tsx`**
```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
export default function ProtectedRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-8">Carregando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 3: `Login.tsx` (e-mail/senha)**
```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function Login() {
  const [email, setEmail] = useState(""); const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false); const nav = useNavigate();
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) { toast.error("Login falhou: " + error.message); return; }
    nav("/produtos", { replace: true });
  }
  return (
    <div className="min-h-screen grid place-items-center bg-muted/30">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Tabela de Preços — Live</h1>
        <form onSubmit={entrar} className="space-y-3">
          <div className="space-y-1"><Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="space-y-1"><Label>Senha</Label>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: `AppLayout.tsx` (nav lateral + sign out)**
```tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { to: "/produtos", label: "Produtos" },
  { to: "/importar", label: "Importar" },
  { to: "/vincular", label: "Vincular itens" },
  { to: "/montado", label: "Produto montado" },
  { to: "/config", label: "Configurações" },
];
export default function AppLayout() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen grid grid-cols-[220px_1fr]">
      <aside className="border-r bg-muted/20 p-4 flex flex-col gap-1 no-print">
        <div className="font-semibold mb-4 px-2">Preços Live</div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            cn("px-3 py-2 rounded-md text-sm hover:bg-muted", isActive && "bg-muted font-medium")}>
            {l.label}
          </NavLink>
        ))}
        <Button variant="ghost" className="mt-auto justify-start" onClick={signOut}>Sair</Button>
      </aside>
      <main className="p-6 overflow-auto"><Outlet /></main>
    </div>
  );
}
```

- [ ] **Step 5: Reescrever `App.tsx` com rotas reais**
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Produtos from "@/pages/Produtos";
import Importar from "@/pages/Importar";
import Vincular from "@/pages/Vincular";
import ProdutoMontado from "@/pages/ProdutoMontado";
import Configuracoes from "@/pages/Configuracoes";

const queryClient = new QueryClient();
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/produtos" element={<Produtos />} />
                <Route path="/importar" element={<Importar />} />
                <Route path="/vincular" element={<Vincular />} />
                <Route path="/montado" element={<ProdutoMontado />} />
                <Route path="/config" element={<Configuracoes />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/produtos" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```
> Nota: as 5 páginas serão criadas nas tasks seguintes. Para compilar agora, criar stubs vazios (`export default function X(){return null}`) e preencher depois — OU executar esta task junto das 3.2–3.6.

- [ ] **Step 6: Type-check + dev**

Run: `npx tsc -p tsconfig.app.json --noEmit` (com stubs) → sem erros.
Run: `npm run dev` → `/login` aparece; sem sessão, `/produtos` redireciona para `/login`.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "feat: auth supabase (login, rota protegida, layout)"
```

---

### Task 3.2: Tela Importar (dropzone + parse + preview + salvar)

**Files:**
- Create: `src/components/ImportDropzone.tsx`, `src/components/ImportPreviewTable.tsx`, `src/pages/Importar.tsx`

- [ ] **Step 1: `ImportDropzone.tsx`**

Input `type="file"` multiple aceitando `.xml,.pdf` + área de drop. `onFiles(files: File[])`. Sem libs externas (usar `onDrop`/`onDragOver` nativos). Botão "Selecionar arquivos".

- [ ] **Step 2: Lógica de parse no `Importar.tsx`**

Para cada arquivo:
- `.xml`: `readFileAsText(file)` → `parseInvoiceFromXML(text)`.
- `.pdf`: `readFileAsArrayBuffer(file)` → `extractPositionedTextFromPDF` → `parseInvoiceFromPositionedItems`; se vazio, fallback `extractTextFromPDF` → `parseInvoiceFromText`.
- Cada `InvoiceItem` vira uma linha editável no preview com: cprod, descricao, unidade, custo_unitario, quantidade, data_emissao (default = `item.emissionDate` ou hoje), fornecedor.
- Itens sem `unitPrice>0` aparecem marcados como "sem custo — será descartado".

- [ ] **Step 3: `ImportPreviewTable.tsx`**

Tabela com inputs controlados por linha (custo e data editáveis para corrigir PDF). Cada nota agrupa seus itens. Botão "Salvar tudo".

- [ ] **Step 4: Salvar (transação lógica)**

Ao salvar, para cada nota:
1. `createNota({ numero, fornecedor, data_emissao, origem, arquivo_nome })`.
2. Carregar `listVinculos()`; aplicar `aplicarAutoVinculo` sobre os itens (por cprod).
3. `insertItens(...)` com `nota_id` e `produto_mestre_id` (preenchido nos auto-vinculados).
4. Toast: "X itens salvos, Y auto-vinculados, Z para vincular". Invalidar queries `["itens"]`, `["pendentes"]`.

- [ ] **Step 5: Verificação manual**

Run: `npm run dev` → logar → Importar → soltar a `nfe-exemplo.xml` → ver 2 itens no preview → Salvar → toast de sucesso.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: tela importar (dropzone, parse xml/pdf, preview, salvar)"
```

---

### Task 3.3: Tela Vincular itens

**Files:**
- Create: `src/pages/Vincular.tsx`

- [ ] **Step 1: Listar pendentes**

`useQuery(["pendentes"], listItensPendentes)`. Mostrar cprod, descricao, custo, fornecedor.

- [ ] **Step 2: Ação de vincular**

Por item: `Select` de produto mestre existente (de `listProdutosMestre`) **ou** botão "Criar mestre" (cria via `createProdutoMestre({ nome: descricao, tipo: 'comprado' })`). Ao confirmar:
1. `vincularItem(item.id, mestreId)`.
2. `upsertVinculo(item.cprod, mestreId)` (memoriza p/ futuro).
3. Mostrar "quantos outros pendentes com o mesmo cprod serão afetados" e oferecer aplicar em lote.
4. Invalidar `["pendentes"]`, `["itens"]`.

- [ ] **Step 3: Verificação manual**

Importar uma NF com cprod novo → aparece em Vincular → vincular a um mestre novo → some da fila. Importar a MESMA NF de novo → item já nasce vinculado (não aparece na fila).

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat: tela vincular itens (fila + criar/ligar mestre + memoria cprod)"
```

---

### Task 3.4: Tela Produtos (resolução + busca + badges + override)

**Files:**
- Create: `src/hooks/useProdutosResolvidos.ts`, `src/components/PriceBadge.tsx`, `src/pages/Produtos.tsx`

- [ ] **Step 1: `useProdutosResolvidos.ts`**

Junta dados e resolve preços (memoizado):
```ts
import { useQuery } from "@tanstack/react-query";
import { listProdutosMestre } from "@/repositories/produtosMestreRepo";
import { listItensComData } from "@/repositories/itensNotaRepo";
import { getConfig } from "@/repositories/configRepo";
import { resolvePrice, type ItemNota, type ProdutoMestre, type ResolvedPrice } from "@/lib/priceResolution";

export interface LinhaProduto extends ProdutoMestre { resolvido: ResolvedPrice; }

export function useProdutosResolvidos() {
  return useQuery({
    queryKey: ["produtos-resolvidos"],
    queryFn: async (): Promise<LinhaProduto[]> => {
      const [mestres, itens, cfg] = await Promise.all([
        listProdutosMestre(), listItensComData(), getConfig(),
      ]);
      const hoje = new Date();
      const porMestre = new Map<string, ItemNota[]>();
      for (const it of itens) {
        if (!it.produto_mestre_id) continue;
        const arr = porMestre.get(it.produto_mestre_id) ?? [];
        arr.push({ id: it.id, custoUnitario: Number(it.custo_unitario), dataEmissao: it.data_emissao, notaId: it.nota_id, notaNumero: it.nota_numero ?? undefined });
        porMestre.set(it.produto_mestre_id, arr);
      }
      return mestres.map((m) => {
        const produto: ProdutoMestre = { id: m.id, nome: m.nome, categoria: m.categoria, tipo: m.tipo, custoManual: m.custo_manual, precoManual: m.preco_manual };
        return { ...produto, resolvido: resolvePrice(produto, porMestre.get(m.id) ?? [], cfg.config, cfg.frete, hoje) };
      });
    },
  });
}
```

- [ ] **Step 2: `PriceBadge.tsx`**

Mapeia `status`: `travado` → badge "preço travado"; `sem_custo_recente` → badge âmbar "sem custo recente"; `sem_preco_manual` → badge âmbar "preço manual pendente" (montado sem preço); `ok` → nada. O `switch`/map deve ser exaustivo sobre `PriceStatus`.

- [ ] **Step 3: `Produtos.tsx`**

Busca por nome/código (input controlado, filtra client-side). Tabela: nome, categoria, tipo, maior custo (`custoBase`), preço venda (`precoVenda` via `formatCurrency`), margem %, origem (nota/data), nº notas no período, badge. Botões "Exportar Excel"/"Exportar PDF" (Task 3.7). Ação "Editar" abre dialog para travar `preco_manual` (e limpar = destravar) via `updateProdutoMestre`; invalida `["produtos-resolvidos"]`.

- [ ] **Step 4: Verificação manual**

Logar → Produtos → ver produto vinculado com preço calculado (maior custo dos 3 meses × markup), margem, origem. Travar preço manual → badge "preço travado" e preço fixo. Destravar → volta ao calculado.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat: tela produtos (resolucao de preco, busca, badges, override manual)"
```

---

### Task 3.5: Produto montado (criar/editar)

**Files:**
- Create: `src/pages/ProdutoMontado.tsx`

- [ ] **Step 1: Formulário**

Campos: nome, categoria, custo manual, preço manual (obrigatório). Submit → `createProdutoMestre({ nome, categoria, tipo: 'montado', custo_manual, preco_manual })`. Lista montados existentes com edição via `updateProdutoMestre`. `react-hook-form` + `zod` (preco_manual > 0).

- [ ] **Step 2: Verificação manual**

Criar "Reformer montado" custo 1000 / preço 2500 → aparece em Produtos como montado, margem 60%.

- [ ] **Step 3: Commit**
```bash
git add -A
git commit -m "feat: tela produto montado (custo+preco manual, margem)"
```

---

### Task 3.6: Configurações (percentuais do markup)

**Files:**
- Create: `src/pages/Configuracoes.tsx`

- [ ] **Step 1: Formulário dos percentuais**

`useQuery(["config"], getConfig)` → preencher inputs com `config` + `frete`. Labels de `percentageLabels` + "Frete (R$)". Salvar → `saveConfig(config, frete)` → invalidar `["config"]` e `["produtos-resolvidos"]` (recalcula todos os preços). `react-hook-form`.

- [ ] **Step 2: Verificação manual**

Mudar lucro de 20→30 → salvar → preços dos produtos comprados sobem.

- [ ] **Step 3: Commit**
```bash
git add -A
git commit -m "feat: tela configuracoes (percentuais do markup + frete)"
```

---

### Task 3.7: Exportação Excel + PDF

**Files:**
- Create: `src/lib/exportXlsx.ts`
- Test: `src/lib/__tests__/exportXlsx.test.ts`
- Modify: `src/pages/Produtos.tsx`

- [ ] **Step 1: Teste primeiro — montar linhas de export**

`exportXlsx.ts` separa a montagem das linhas (testável) da escrita do arquivo. Teste:
```ts
import { describe, it, expect } from "vitest";
import { montarLinhasExport } from "@/lib/exportXlsx";
import type { LinhaProduto } from "@/hooks/useProdutosResolvidos";

const linha: LinhaProduto = {
  id: "1", nome: "Parafuso", categoria: "Fixação", tipo: "comprado",
  custoManual: null, precoManual: null,
  resolvido: { precoVenda: 100, custoBase: 50, margemPercent: 50, status: "ok",
    origem: { notaId: "n1", notaNumero: "123", dataEmissao: "2026-05-01" }, numNotasPeriodo: 2 },
};

describe("montarLinhasExport", () => {
  it("mapeia colunas pt-BR", () => {
    const [row] = montarLinhasExport([linha]);
    expect(row).toMatchObject({
      Produto: "Parafuso", Categoria: "Fixação", "Maior custo": 50,
      "Preço venda": 100, "Data do custo": "2026-05-01", "Nº notas no período": 2,
    });
  });
});
```

- [ ] **Step 2: Rodar — FALHA**

Run: `npm test -- exportXlsx` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `exportXlsx.ts`**
```ts
import * as XLSX from "xlsx";
import type { LinhaProduto } from "@/hooks/useProdutosResolvidos";

export function montarLinhasExport(linhas: LinhaProduto[]) {
  return linhas.map((l) => ({
    Produto: l.nome,
    Categoria: l.categoria ?? "",
    Tipo: l.tipo,
    "Maior custo": l.resolvido.custoBase ?? "",
    "Preço venda": l.resolvido.precoVenda ?? "",
    "Margem %": l.resolvido.margemPercent != null ? Number(l.resolvido.margemPercent.toFixed(1)) : "",
    "Data do custo": l.resolvido.origem?.dataEmissao ?? "",
    "Nº notas no período": l.resolvido.numNotasPeriodo,
    Status: l.resolvido.status,
  }));
}

export function exportarXlsx(linhas: LinhaProduto[], nomeArquivo = "tabela-precos.xlsx") {
  const ws = XLSX.utils.json_to_sheet(montarLinhasExport(linhas));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Preços");
  XLSX.writeFile(wb, nomeArquivo);
}
```

- [ ] **Step 4: Rodar — PASSA**

Run: `npm test -- exportXlsx` → PASS.

- [ ] **Step 5: PDF via print-to-PDF (sem nova dep)**

Em `Produtos.tsx`: envolver a tabela num `<div id="print-area">` com cabeçalho (logo Live + "Tabela de Preços" + data de geração). Botão "Exportar PDF" chama `window.print()`. O CSS de print da Task 0.2 isola `#print-area`. Botão "Exportar Excel" chama `exportarXlsx(linhas)`.

- [ ] **Step 6: Verificação manual**

Produtos → Exportar Excel → baixa `.xlsx` com as colunas. Exportar PDF → diálogo de impressão mostra só a tabela + cabeçalho.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "feat: exportacao excel (xlsx) e pdf (print) da tabela de precos"
```

---

## Phase 4 — Deploy (precos.liveuni.com.br)

### Task 4.1: Configs de deploy (nginx + docker-stack + script)

**Files:**
- Create: `nginx/precos.liveuni.com.br.conf`, `docker-stack.yml`, `deploy.sh`

- [ ] **Step 1: `nginx/precos.liveuni.com.br.conf`**

Copiar o conf do cost-to-love trocando `calculator`→`precos` e `server_name`/`root` para `precos.liveuni.com.br` / `/var/www/precos.liveuni.com.br` (mantém SPA fallback, cache de assets, no-cache index.html, headers de segurança).

- [ ] **Step 2: `docker-stack.yml`**
```yaml
version: "3.8"
services:
  precos:
    image: nginx:alpine
    volumes:
      - /opt/precos/dist:/usr/share/nginx/html:ro
      - /opt/precos/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - Rodrigo
    deploy:
      replicas: 1
      labels:
        - traefik.enable=true
        - traefik.http.routers.precos.entrypoints=websecure
        - "traefik.http.routers.precos.rule=Host(`precos.liveuni.com.br`)"
        - traefik.http.routers.precos.tls.certresolver=letsencryptresolver
        - traefik.http.services.precos.loadbalancer.server.port=80
networks:
  Rodrigo:
    external: true
```

- [ ] **Step 3: `deploy.sh`**
```bash
#!/usr/bin/env bash
set -e
SSH_KEY="$HOME/.ssh/squad_vps"
VPS_USER="root"
VPS_HOST="103.199.187.99"
echo "→ Build de produção..."
npm run build
echo "→ Enviando dist para VPS..."
scp -i "$SSH_KEY" -r dist "$VPS_USER@$VPS_HOST:/opt/precos/"
echo "✓ Deploy: https://precos.liveuni.com.br"
```
Tornar executável: `chmod +x deploy.sh`.

- [ ] **Step 4: Commit**
```bash
git add nginx/ docker-stack.yml deploy.sh
git commit -m "chore: configs de deploy (nginx + docker swarm + script) precos.liveuni"
```

---

### Task 4.2: Provisionar Supabase + primeiro deploy + verificação de produção

**Files:** (nenhum no repo — operação de infra; `.env` local NÃO versionado)

- [ ] **Step 1: Criar projeto Supabase novo**

Criar projeto. Em SQL Editor, rodar `supabase/migrations/0001_init.sql`. Confirmar 5 tabelas + RLS ativo + linha singleton em `config_markup`.

- [ ] **Step 2: Auth e-mail/senha**

Authentication → Providers → Email habilitado. (Opcional: desabilitar signups públicos e criar o usuário do Rodrigo manualmente em Users → Add user.)

- [ ] **Step 3: `.env` local (não commitar)**

Criar `.env` na raiz com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key — pública, OK). `service_role` NUNCA entra no front-end. Confirmar `.env` ignorado: `git status` não deve listá-lo.

- [ ] **Step 4: DNS**

Apontar `precos.liveuni.com.br` (A/CNAME) para a VPS `103.199.187.99` (mesmo padrão das outras apps Live no Traefik).

- [ ] **Step 5: Subir a stack no Swarm (uma vez)**

No VPS: criar `/opt/precos/`, copiar `nginx/precos.liveuni.com.br.conf` para `/opt/precos/nginx.conf`, `docker stack deploy -c docker-stack.yml precos` (rede `Rodrigo` já externa).

- [ ] **Step 6: Build + deploy**

Run: `./deploy.sh`
Expected: build OK, `dist` enviado para `/opt/precos/dist`, sem erros.

- [ ] **Step 7: Verificação de produção (critério de pronto)**

Acessar `https://precos.liveuni.com.br` → logar com o usuário criado → Importar a NF real → Produtos → ver preço de venda na tela. Se OK, o critério de pronto do spec está atendido.

- [ ] **Step 8: Commit final / tag**
```bash
git add -A
git commit -m "docs: tabela de precos no ar em precos.liveuni.com.br"
```

---

## Self-Review (cobertura do spec)

- §1 Objetivo / regra dos 3 meses → Task 1.3 (`resolvePrice`).
- §2 Decisões (markup único, XML+PDF, online Supabase, login, Excel+PDF, mapeamento manual, auto-vínculo, comprado/montado, override) → Tasks 1.1–1.5, 2.x, 3.x.
- §3 Stack/infra → Tasks 0.1, 4.x.
- §4 Fluxo do usuário → Tasks 3.2–3.7.
- §5 Modelo de dados → Task 2.1 (todas as 5 tabelas + RLS).
- §6 Resolução de preço (prioridade override→montado→comprado→sem custo) → Task 1.3 (testes cobrem as 3 vias).
- §7 Parsing XML + PDF best-effort → Task 1.2 (porta `parsers.ts`).
- §8 Telas (login, importar, vincular, produtos, montado, config) → Tasks 3.1–3.6.
- §9 Exportação Excel + PDF → Task 3.7.
- §10 Estratégia de testes → Tasks 1.1–1.5, 3.7 (todos com teste).
- §11 Segurança/LGPD → RLS (2.1), `.env` ignorado (0.1/4.2), deps fixadas (0.1).
- §12 Deploy → Tasks 4.1–4.2.
- §13 YAGNI → respeitado (sem Nomus, sem roles, markup único, sem DRE).

**Type consistency:** `PricingPercentages` (camelCase) é a fonte única; DB usa snake_case convertido só em `markupConfig.ts`. `ResolvedPrice`/`ItemNota`/`ProdutoMestre` definidos uma vez em `priceResolution.ts` e reusados no hook e no export. `Vinculo` definido em `autoLink.ts` e reusado no repo.

**Decisão registrada:** Margem % = `(preço − custo) / preço × 100` (margem sobre o preço de venda). Se o Rodrigo preferir markup sobre custo, mudar só `margem()` em `priceResolution.ts` e o teste correspondente.

**Nova dependência:** nenhuma além das já usadas no cost-to-love. PDF via `window.print()` (print-to-PDF) — zero deps novas.
