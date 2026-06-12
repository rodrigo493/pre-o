# Catálogo Nomus + vínculo inteligente + conversão de unidade

**Data:** 2026-06-08
**Status:** Aprovado para implementação

## Problema

Hoje, ao importar uma nota, os itens novos viram produto mestre um a um (tela Vincular,
um clique por código novo). O Rodrigo quer carregar o catálogo do Nomus (~4.700 produtos,
código + descrição) de uma vez, e na hora de vincular o item da nota **buscar** nesse
catálogo. Além disso, a nota às vezes vem em unidade diferente da do Nomus (ex.: kg na
nota, peça no Nomus) e o custo precisa ser **convertido** para a unidade principal.

## Decisões

- **Import:** tela fixa no app (`/catalogo`), reaproveitável; aceita vários PDFs do Nomus.
- **Campos:** Código → `codigo`, Descrição → `nome`, U.M. → `unidade`,
  U.M. Secundária → `unidade_secundaria`, Ressuprimento → `tipo`
  (`Comprado`/`Como padrão comprado` → `comprado`; `Fabricado` → `montado`).
- **Vínculo:** híbrido — busca manual por código/descrição **+** sugestão automática
  (fuzzy) **+** memória cProd→produto (auto-vínculo nas próximas notas, já existe).
- **Conversão:** fator fixo por produto. `fator_conversao` = **quantos da unidade
  secundária equivalem a 1 unidade principal** (ex.: chapa → 47,1 kg = 1 peça).
  Custo convertido = `custo_da_nota × fator` quando a unidade da nota = unidade secundária.

## Arquitetura

### Banco (migration 0004)
- `produtos_mestre`: + `unidade text`, `unidade_secundaria text`, `fator_conversao numeric`.
- Índice único parcial em `codigo` (where codigo is not null) → upsert/dedup.
- `api_precos` (RPC): aplica a conversão no `max(custo_unitario)` para manter a API do
  LiveCRM consistente com o app.

### Libs (puras, testadas)
- `catalogParser.ts` — parse posicional do PDF Nomus (reusa `extractPositionedTextFromPDF`).
  Detecta colunas pelo cabeçalho; acumula descrição multilinha; trata quebra de página;
  pula cabeçalhos repetidos. Saída: `{ codigo, nome, unidade, unidadeSecundaria, tipo }[]`.
- `unitConvert.ts` — `converterCusto(custo, unidadeNota, produto)` → `{ custo, pendente }`.
- `fuzzyMatch.ts` — `bestMatch(query, candidates)` por tokens (Dice), com limiar.

### Camada de preço
- `priceResolution.ts` — converte cada item antes do maior custo; expõe `conversaoPendente`.
- `useProdutosResolvidos.ts` — passa unidade/secundária/fator e `unidade` do item.

### UI
- `pages/ImportarCatalogo.tsx` (`/catalogo`) — dropzone múltipla → parse → resumo
  (lidos/novos/atualizam/ignorados) + amostra → upsert por código.
- `components/VincularRow.tsx` — combobox de busca (código+nome, sem acento) + sugestão
  no topo + aviso de unidade divergente. Mantém criar mestre + lote + memória.
- `components/EditarPrecoDialog.tsx` — campos unidade, unidade secundária e fator.
- `pages/Produtos.tsx` — badge "conversão pendente" quando aplicável.
- `AppLayout.tsx` — item de menu "Importar catálogo".

## Erros & testes
- Parse por arquivo isolado (um PDF ruim não derruba os outros).
- Linhas sem código ou sem nome → ignoradas e contadas.
- Testes: catalogParser (fixture real), unitConvert, fuzzyMatch, conversão no resolvePrice.
