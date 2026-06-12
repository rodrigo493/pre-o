# Design — Criar produto a partir da ficha técnica (PDF)

**Data:** 2026-06-11
**Tela:** Produto montado (`/montado`)
**Status:** aprovado para implementação

## Problema

Hoje, para cadastrar um produto montado, o usuário:
1. preenche um formulário manual (nome/código/grupo) → **dá erro** quando o código já existe no catálogo Nomus (índice único em `codigo`, ver `0005_fix_codigo_index.sql`);
2. depois abre a composição e importa o PDF, vinculando componentes um a um.

O usuário quer **1 clique**: subir a ficha técnica (PDF) e o sistema **cria o produto inteiro já precificado**, aparecendo em Produtos com custo e preço de venda.

## A lógica da composição (validada no PDF real V5 PLUS)

A "Ficha Técnica do Produto" do Nomus é **uma ficha só, espalhada em N páginas** (no exemplo, 11). É a **explosão completa** do produto até a matéria-prima. Características confirmadas nos dados reais:

- **Sem coluna de nível, sem indentação.** A hierarquia (montagem dentro de montagem) só existe visualmente por negrito + ordem de leitura — e o **negrito não é capturado** pelo nosso extrator (os itens só têm `str, x, y, width`). Logo, **não dá para reconstruir a árvore com segurança** a partir de um único PDF achatado.
- Os itens vêm classificáveis por **prefixo do código**:
  - **Fabricados por nós** (montagem/intermediário, **não aparecem nas notas**): `EST`, `MO`, `MOP`, `MOF`, `KIT`.
  - **Matéria-prima comprada** (custo vem da nota): **todo o resto** (`LA`, `US`, `CO`, `SXT`, `PF`, `TAP`, `TB`, `QUAD`, `FRM`, `MDF`, `PO`, `RO`, `EMB`, …).
- Como a ficha já explode tudo até a matéria-prima, **o custo do produto = soma das matérias-primas (folhas) × qtd × custo-da-nota**. As linhas fabricadas (`EST/MO/MOP/MOF/KIT`) são **ignoradas no custo** — senão contaríamos a montagem **e** o conteúdo dela (dupla contagem). Isso também dispensa a árvore: somamos todas as matérias-primas do produto inteiro.

### Validação no PDF real (V5 PLUS)

- 244 itens únicos → **67 fabricados** (todos genuinamente montagem/peça nossa) + **177 matérias-primas**.
- Nenhuma matéria-prima caiu na lista de fabricados por engano.
- Soma de duplicados funciona (ex.: tinta `CO.069` somou 2,88 KG ao longo da ficha).

## Escopo

### Inclui
- Botão **"Importar ficha técnica (PDF)"** na tela `/montado`.
- Extração de cabeçalho **por posição** (código, descrição, grupo) — reescrita, porque a regex atual sobre texto concatenado falha (no teste o código saiu `"Descri"`).
- Classificação de itens por prefixo (fabricado vs matéria-prima).
- Diálogo de confirmação **editável** (código/nome/grupo pré-preenchidos + contagem encontrados/não-encontrados) antes de gravar.
- **Find-or-create pelo código** (corrige o erro de duplicado).
- Gravação da composição = matérias-primas casadas no catálogo; custo = soma + impostos + lucro = preço.

### NÃO inclui (e por quê)
- **Reconstrução automática da árvore de sub-montagens a partir de um único PDF.** Inviável de forma confiável sem coluna de nível/indentação/negrito. Para ter cada montagem como produto próprio precificado, o usuário importa a ficha técnica **de cada montagem** pelo mesmo botão — cada uma é precificada pelas próprias matérias-primas (independente, confiável).
- Criação automática de matérias-primas ausentes no catálogo. Mantém-se o comportamento atual: avisa as não-encontradas para o usuário importar via catálogo Nomus.

## Arquitetura

Reaproveita o máximo do que já existe. Unidades:

### 1. `composicaoParser.ts` — extração (alterado)
- **`extrairCabecalho` reescrito para usar posição (x/y)** em vez de regex sobre texto concatenado:
  - localizar os rótulos `Código do Produto:`, `Descrição do produto:`, `Grupo de Produto:` pelos seus tokens;
  - pegar o valor na **mesma coluna (x do rótulo), na(s) linha(s) seguinte(s)**, antes do início da tabela de componentes.
  - Best-effort: o que sobrar imperfeito é corrigido no diálogo editável.
- O parse de itens (tabela Componente|Descrição|Qtde|UM) **não muda**.

### 2. `composicaoClassify.ts` — classificação (novo, puro)
- `PREFIXOS_FABRICADOS = new Set(["EST","MO","MOP","MOF","KIT"])`.
- `prefixoDoCodigo(codigo): string` → parte antes do primeiro `.` ou espaço, em maiúsculas.
- `ehFabricado(codigo): boolean`.
- `separarComposicao(itens)` → `{ materiaPrima: ComposicaoItem[], fabricados: ComposicaoItem[] }`.
- Função pura, 100% testável sem banco.

### 3. `criarProdutoDaFicha.ts` (ou método no repo) — orquestração (novo)
Recebe `{ header, materiaPrima, catalogo }` e:
1. **Find-or-create** do produto-mestre pelo `codigo` (se existe → update tipo/nome/grupo; senão insert), `tipo = "montado"`.
2. `clearComponentes(montadoId)` + `insertComponentes` com as matérias-primas **casadas no catálogo** (por código → id).
3. Retorna `{ montadoId, vinculados, naoEncontrados }`.
- Custo/preço **não** são calculados aqui: já saem automáticos do `useProdutosResolvidos` (soma recursiva de componentes) + markup. O produto aparece precificado em Produtos sem código novo de cálculo.

### 4. UI — `ImportarFichaDialog.tsx` (novo) + botão em `ProdutoMontado.tsx`
- Botão "Importar ficha técnica (PDF)" abre input de arquivo.
- Ao escolher o PDF: parseia, classifica, e abre **diálogo de confirmação**:
  - campos editáveis: Código, Nome, Grupo (pré-preenchidos pelo cabeçalho);
  - resumo: "X matérias-primas encontradas no catálogo, Y não encontradas (ignoradas)";
  - lista colapsável das não-encontradas.
- Botão "Criar produto" → chama a orquestração → `toast` de sucesso → invalida queries → produto aparece na lista e em Produtos.

## Fluxo de dados

```
PDF → parseComposicaoFile
        ├─ header (código/desc/grupo)         → diálogo (editável)
        └─ itens → separarComposicao
                     ├─ fabricados (EST/MO/MOP/MOF/KIT) → descartados
                     └─ materiaPrima → casar no catálogo por código
                                         ├─ encontradas → componentes do montado
                                         └─ não encontradas → aviso
confirmar → find-or-create(montado) + regravar componentes
          → useProdutosResolvidos recalcula custo (soma) + markup → preço
          → aparece em Produtos
```

## Tratamento de erros
- Código de cabeçalho vazio após edição → bloquear com mensagem ("Informe o código do produto").
- Find-or-create: usar o mesmo padrão de `upsertCatalogByCodigo` (busca id por código, decide insert vs update) para não esbarrar no `ON CONFLICT` parcial.
- PDF sem itens reconhecíveis → toast de aviso, não cria nada.
- Falha de banco → toast com `dbErr` detalhado.

## Testes
- **`composicaoClassify.test.ts`** (unit, puro): prefixos, `ehFabricado`, `separarComposicao` — incluindo casos `MO`, `MOP`, `MOF`, `EST`, `KIT` (fabricados) e `LA`, `US`, `CO` (comprados).
- **`composicaoParserReal.test.ts`** (estendido): cabeçalho do V5 PLUS extraído por posição retorna `codigo = "V5P"` (não `"Descri"`) e descrição sem o código colado; contagem fabricados=67 / matéria-prima=177 estável.
- Cobertura mínima 80% nas funções puras novas.

## Resultado esperado
1 clique no PDF → produto criado/atualizado, composição = matérias-primas, **custo e preço de venda automáticos em Produtos**, sem o erro de código duplicado. Cada montagem vira produto próprio importando a ficha dela.
