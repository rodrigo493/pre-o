# Design — Calculador de peças (LA / chapa laser)

**Data:** 2026-06-11
**Tela nova:** `/calculador`
**Status:** aprovado para implementação
**Escopo desta fase:** apenas **LA** (peças de chapa cortadas a laser). TB e US virão depois.

## Problema

Peças `LA` são chapas cortadas a laser que vocês fabricam — elas **não têm custo unitário direto na nota** (o que entra na nota é a **chapa** crua, comprada por kg). Hoje essas peças ficam sem custo, o que deixa montados subprecificados.

O usuário quer uma página **Calculador** onde, para cada peça LA, informa espessura + medidas + tempo de corte, e o sistema calcula o custo unitário da peça. Ao salvar, o custo fica **registrado na peça e se atualiza sozinho** conforme novas notas mudam o preço da chapa.

## A conta (validada com exemplo)

Para uma peça LA:

### 1. Custo do material
- `área_peça = largura_mm × comprimento_mm` (mm²)
- `área_chapa` conforme espessura: 1200×3000 = **3.600.000 mm²** (1,2/1,5/2/3,17mm) · 1500×3000 = **4.500.000 mm²** (4,76/6,35/12,7mm)
- `fração = área_peça ÷ área_chapa` (mostrado como % na tela)
- `valor_chapa = R$/kg × peso_chapa_kg`
- `custo_material = fração × valor_chapa`

### 2. Custo do tempo de laser
- `tempo_horas = tempo_corte_seg ÷ 3600`
- `custo_laser = valorHoraLaser × tempo_horas` (`valorHoraLaser` já existe em `config_markup`)

### 3. Custo unitário da peça
- `custo_unitario = custo_material + custo_laser`

**Exemplo:** peça 200×300mm (=60.000 mm²), chapa 1,2mm (área 3.600.000, peso 34kg), R$/kg = 10 → valor_chapa = 340; fração = 1,667% → material = R$5,67. Tempo 90s → 0,025h × R$120/h = R$3,00. **Total = R$8,67.**

## Princípio central: custo dinâmico, não congelado

Ao salvar, **NÃO** gravamos um número fixo. Gravamos os **parâmetros** (espessura, largura, comprimento, tempo). O custo é **recalculado na camada de resolução** (`useProdutosResolvidos`), puxando:
- `R$/kg` = custo atual da **chapa daquela espessura** vindo das notas (mesma regra do resto: maior custo dos últimos 3 meses), e
- `valorHoraLaser` do config.

Assim, nota nova da chapa → custo da peça LA atualiza sozinho → reflete nos montados e em Produtos.

## Mapa espessura → chapa (dados reais fornecidos)

| Espessura | Código da chapa (catálogo/nota) | Área (mm²) | Peso (kg) |
|---|---|---|---|
| 1,2 mm | `CH.LISA.1200X3000X1,2MM` | 3.600.000 | 34 |
| 2,0 mm | `CH.LISA.1200X3000X2,0MM` | 3.600.000 | 56,8 |
| 3,17 mm | `CH.LISA.1200X3000X3,00MM` | 3.600.000 | 85 |
| 4,76 mm | `CH.LISA.1500X3000X4,75MM` | 4.500.000 | 169 |
| 6,35 mm | `CH.LISA.1500X3000X6,30MM` | 4.500.000 | 223 |

1,5 mm e 12,7 mm ficam fora desta fase (sem chapa/peso informados); o modelo permite acrescentá-las depois.

## Arquitetura

### 1. Banco — duas tabelas novas (migration `0011`)
- **`config_chapas`** (mapa por espessura, seed com as 5 linhas acima):
  `espessura numeric PK, chapa_codigo text, area_mm2 numeric, peso_kg numeric`.
- **`pecas_laser`** (receita por peça LA):
  `produto_mestre_id uuid PK/FK → produtos_mestre(id), espessura numeric → config_chapas, largura_mm numeric, comprimento_mm numeric, tempo_corte_seg numeric, updated_at`.
- RLS igual às demais tabelas do projeto (authenticated full access), seguindo o padrão existente.

### 2. Cálculo puro — `src/lib/laserCost.ts` (novo, testável)
- `calcularCustoPecaLaser({ larguraMm, comprimentoMm, tempoSeg, areaChapaMm2, pesoChapaKg, rkgChapa, valorHoraLaser })` → `{ fracao, valorChapa, custoMaterial, custoLaser, custoUnitario }`.
- Função pura, sem banco. Cobertura ≥ 80%, incluindo o exemplo numérico acima.

### 3. Repositórios — `src/repositories/pecasLaserRepo.ts` e `configChapasRepo.ts`
- `listConfigChapas()`, `upsertPecaLaser(spec)`, `getPecaLaser(produtoId)`, `listPecasLaser()`.

### 4. Resolução de custo — `useProdutosResolvidos` (alterado)
- Carregar `listConfigChapas()` + `listPecasLaser()` junto das outras queries.
- Montar `rkgPorCodigo` (custo das chapas por código, vindo de `custoComprado`).
- Para cada peça com spec em `pecas_laser`: calcular `custoUnitario` via `laserCost` e **sobrescrever** o valor em `custoCompradoPorId[produtoId]`. Como a recursão de montados lê esse mapa, os montados pegam o custo da peça automaticamente.
- Se faltar dado (chapa sem custo na nota / espessura não mapeada): custo da peça = 0 com flag de pendência (igual ao "sem custo" atual).

### 5. UI — `src/pages/Calculador.tsx` (novo) + rota `/calculador` + item no menu
- **Seleção da peça**: busca/seleção de um produto do catálogo (foco em prefixo `LA`, mas permite qualquer um).
- **Campos**: espessura (dropdown vindo de `config_chapas`), largura (mm), comprimento (mm), tempo de corte (seg).
- **Detalhamento ao vivo**: área da peça, % da chapa, R$/kg atual (das notas), valor da chapa, custo material, custo laser, **custo unitário**.
- **Salvar**: grava/atualiza `pecas_laser` da peça; invalida queries → custo passa a valer em Produtos e nos montados.
- Lista das peças já calculadas (com custo atual recalculado) para reconsulta/edição.

## Tratamento de erros
- Largura/comprimento/tempo ≤ 0 ou vazios → bloquear salvar com mensagem.
- Chapa da espessura sem custo nas notas → salva mesmo assim, mas mostra aviso "chapa sem custo na nota — importe a nota".
- `valorHoraLaser = 0` → aviso para configurar em Configurações.

## Testes
- `laserCost.test.ts` (unit puro): exemplo numérico (8,67), fração, ambas as áreas, tempo zero, valores limite.
- Integração leve do override em `useProdutosResolvidos` (mock das queries) garantindo que a peça com spec recebe o custo calculado e que um montado que a usa soma corretamente.

## Resultado esperado
Página Calculador onde, por peça LA, você informa espessura + medidas + tempo → vê o custo detalhado → salva. O custo fica registrado e **se atualiza sozinho** quando entram notas novas da chapa, refletindo automaticamente nos produtos montados e na tela Produtos.

## Fases seguintes (fora deste spec)
- **TB** e **US**: mesma página, outras fórmulas (a definir com o usuário).
- Espessuras 1,5mm e 12,7mm (quando houver chapa/peso).
- Mapa espessura→chapa editável por UI (hoje vem por seed).
