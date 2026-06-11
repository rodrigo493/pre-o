# Custo composto para peças fabricadas (US / TB / LA) — Design

**Data:** 2026-06-11
**Status:** Aprovado pelo usuário (brainstorming concluído)

## Contexto

No live-precos, produtos `montado` custam hoje a soma recursiva dos componentes
(`useProdutosResolvidos.custoDe`). Isso não cobre três famílias de peças fabricadas:

- **US (usinados):** o torneiro cobra só a **mão de obra**, que vem na nota fiscal com o
  próprio código US. O material (barra de trefilado) é comprado à parte pela Live e
  enviado inteiro ao torneiro.
- **TB (tubos):** cortados internamente no **laser**. O material (barra de tubo) é
  comprado por kg.
- **LA (corte laser em chapa):** cortados internamente no laser. O material (chapa)
  é comprado por kg.

A ficha técnica do Nomus já informa o consumo de material como **fração da barra/chapa**
(ex.: `FRM.TRE.4,76MM — 0,03 BR`, `QUAD.50X50X2.0 — 0,07 BR`), importável pelo botão
"Importar ficha técnica (PDF)" já existente.

O custo do material em barra/chapa **não precisa de código novo**: a nota vem em R$/kg e
o campo `fator_conversao` + `conversao_op = "multiplicar"` do produto (já existente,
editável no Editar Preço) converte para R$/barra usando o peso da barra/chapa em kg.
Exemplos reais (planilha do usuário): 1.1/4"x2 = 8,88 kg · 50x30x2 = 14,5 kg ·
80x40x2 = 22 kg · 3"x2 = 22,1 kg · 1.1/2"x2 = 10,8 kg · 100x40x2 = 25,79 kg · 50.8x2 = 7 kg.

## Objetivo

Custo do produto fabricado = **componentes da ficha + serviço**, onde o serviço é:

| Família | Material (ficha Nomus) | Serviço |
|---|---|---|
| US | trefilado em fração de barra | mão de obra = preço da nota do próprio código |
| TB | tubo em fração de barra | tempo de corte × valor da hora do laser |
| LA | chapa (fração) | tempo de corte × valor da hora do laser |

Fórmula geral do montado:

```
custo = Σ componentes
      + (soma_nota ? maior preço da nota do próprio código nos últimos 3 meses : 0)
      + (tempo_corte_min != null ? tempo_corte_min / 60 × valor_hora_laser : 0)
```

Os dois extras podem coexistir no mesmo produto.

## Modelo de dados

### Migration 0010 — `produtos_mestre`

- `soma_nota boolean NOT NULL DEFAULT false` — quando ligada, soma ao custo dos
  componentes o maior preço unitário da nota do próprio `codigo` (mesma janela móvel de
  3 meses e mesmas conversões de unidade dos comprados).
- `tempo_corte_min numeric NULL` — minutos de laser para cortar a peça (aceita decimal).

### Migration 0010 — `config_markup`

- `valor_hora_laser numeric NOT NULL DEFAULT 0` — R$/hora do laser, configuração global
  (singleton id=1, como o markup).

## Resolução de custo

### `useProdutosResolvidos.custoDe(id)` (recursão)

Os extras entram **dentro da recursão**, para que uma peça US/TB/LA usada como
componente de um aparelho propague o custo completo:

```
custoDe(montado) = Σ custoDe(componente) × qtd
                 + (soma_nota ? custoNota(montado) : 0)
                 + tempoCorteMin/60 × valorHoraLaser
```

- `custoNota(montado)`: maior custo unitário convertido dos itens de nota vinculados ao
  produto na janela de 3 meses — mesma lógica do comprado em `resolvePrice`
  (prioridade fator do vínculo cProd → fator do produto com op). Hoje
  `custoCompradoPorId` só é calculado para `tipo !== "montado"`; passa a ser calculado
  também para montados com `soma_nota = true`.
- Montado **sem componentes** mas com extras: o custo passa a ser
  `extras + custo_manual` (hoje é só `custo_manual`). Caso típico: US sem ficha
  importada ainda — pelo menos a mão de obra aparece.
- `valor_hora_laser = 0` ou `tempo_corte_min = null` → parcela de laser = 0 (sem erro).

### `resolvePrice` / status

- `ResolvedPrice` ganha decomposição para exibição:
  `custoComponentes`, `custoMaoDeObra` (parcela da nota) e `custoCorteLaser` —
  todos `number | null`.
- Aviso de incompletude: se `soma_nota = true` e não houver item de nota do código na
  janela → o produto é sinalizado (`maoDeObraPendente: boolean`) e exibido com alerta
  (badge/tooltip), sem bloquear o cálculo (a parcela vale 0).

## Marcação automática do prefixo US

- **Importação de catálogo** (`catalogParser` / fluxo de import): produtos com código de
  prefixo `US` (já classificados como `montado` por `FABRICADO_PREFIXES`) recebem
  `soma_nota = true`.
- **Importar ficha técnica** (`findOrCreateMontadoByCodigo`): se o `codigo` tem prefixo
  `US`, cria/atualiza com `soma_nota = true`.
- Prefixo extraído com a regra existente `prefixoDoCodigo` (parte antes do primeiro
  `.` ou espaço, uppercase).
- A flag permanece **editável por produto** (pode desligar/ligar manualmente em
  qualquer montado).

## UI

### Configurações (`src/pages/Configuracoes.tsx`)

- Novo campo "Valor da hora do laser (R$/h)" junto das configurações de markup,
  persistido em `config_markup.valor_hora_laser`.

### Edição do produto montado (`EditarMontadoDialog`)

- Toggle **"Somar mão de obra da nota"** (`soma_nota`) com texto auxiliar: "usa o maior
  preço da nota deste código nos últimos 3 meses (ex.: torneiro dos US)".
- Campo **"Tempo de corte laser (min)"** (`tempo_corte_min`), numérico decimal,
  vazio = não corta no laser.

### Exibição do custo

- Página do produto montado (`ProdutoMontado.tsx`): decomposição visível —
  Componentes R$ X + Mão de obra R$ Y + Corte laser R$ Z = Custo R$ T.
- Badge/ícone de alerta quando `maoDeObraPendente`.

## Repositórios

- `produtosMestreRepo`: leitura/escrita dos novos campos (`listProdutosMestre`,
  update do montado, `findOrCreateMontadoByCodigo`).
- `configRepo` / `markupConfig`: ler/gravar `valor_hora_laser`.

## Casos de borda

- US com `soma_nota` e ficha importada, mas sem nota do torneiro no período → custo =
  só componentes, com alerta `maoDeObraPendente`.
- Peça com `soma_nota` **e** `tempo_corte_min` → soma as duas parcelas (permitido).
- Ciclo na composição → guarda existente (`visitando`) permanece; extras do produto em
  ciclo não são somados duas vezes porque `custoDe` memoiza.
- `preco_manual` definido → continua travando o preço de venda (status `travado`),
  mas o custo exibido usa a decomposição nova.
- Barra/chapa sem `fator_conversao` cadastrado → custo da barra fica em R$/kg
  (errado p/ fração de barra); não é erro de sistema — mitigado pelo cadastro em lote
  dos pesos (fora do escopo de código; ver Rollout).

## Testes

- `priceResolution`/`custoDe`: unidade para cada parcela (nota, laser, combinação,
  ausência de nota → pendente, montado sem componentes com extras, recursão com peça
  US dentro de aparelho).
- `markupConfig`: round-trip do `valor_hora_laser`.
- Marcação automática: `findOrCreateMontadoByCodigo` com código US liga `soma_nota`;
  catálogo idem.
- UI: render da decomposição e dos novos campos (mínimo viável, padrão do projeto).

## Fora de escopo

- Tela dedicada de "cadastro de bitolas/pesos" — usa-se o fator de conversão existente.
- Mudança no tipo (`usinado` novo) — descartado no brainstorming (abordagem C).
- Transação atômica do clear+insert de composição (follow-up antigo, independente).

## Rollout (operacional, com o usuário)

1. Deploy + migration 0010.
2. Configurar valor da hora do laser.
3. Cadastrar peso da barra/chapa (fator de conversão × multiplicar) nas bitolas.
4. Importar fichas técnicas dos itens US/TB/LA.
5. Preencher tempo de corte dos TB/LA; conferir `soma_nota` dos US.
