# Tabela de Preços a partir de Notas Fiscais — Design

**Data:** 2026-06-06
**Projeto:** live-precos (`C:\VS_CODE\live-precos`)
**Autor:** Rodrigo Siqueira (Live Equipamentos) + Claude

---

## 1. Objetivo

Ferramenta web onde o usuário joga notas fiscais (XML e/ou PDF), o sistema extrai
os produtos com seus custos, aplica um markup fiscal e gera uma **tabela de preços
de venda** consultável por produto.

Regra de negócio central: o preço de venda de um produto é calculado a partir do
**maior custo unitário registrado nos últimos 3 meses** (janela móvel). Isso garante
que o preço nunca fique abaixo da reposição mais cara recente.

## 2. Decisões tomadas (brainstorming)

| Tema | Decisão |
|---|---|
| Escopo | Ferramenta **nova e separada** (não estende o cost-to-love) |
| Cálculo do preço | **Markup fiscal completo**, portado do cost-to-love (`pricing.ts`) |
| Config do markup | **Única** para todos os produtos (um conjunto de percentuais) |
| Entrada | **XML** (exato) + **PDF DANFE** (best-effort) |
| Persistência | **Online**, Supabase (**projeto novo**), salva tudo |
| Acesso | **Login simples** (e-mail/senha, Supabase Auth) |
| Exportação | **Excel (.xlsx)** + **PDF** |
| Identificação de produto | **Mapeamento manual** para "produto mestre" |
| Auto-vínculo | **Sim** — lembra `cProd → produto mestre` e auto-vincula notas futuras |
| Janela de preço | **Últimos 3 meses**, pega o **maior custo** |
| Subdomínio | `precos.liveuni.com.br` |

## 3. Stack e infraestrutura

- **Front-end:** React + Vite + TypeScript + Tailwind + shadcn/ui
  (mesma base do cost-to-love → reuso direto de parser e fórmula de preço)
- **Back-end / dados:** Supabase (projeto novo) — Postgres + Auth + RLS
- **Deploy:** Docker + Traefik na VPS Live, subdomínio `precos.liveuni.com.br`
  (mesmo padrão das demais apps Live)
- **Testes:** Vitest (unidade) + fixtures de NF reais

Descoberta importante: a fórmula `calculateSellingPrice` **não usa** os impostos da
nota — ela aplica **alíquotas configuradas** (ICMS, IPI, PIS, COFINS, CSLL, IR,
despesas, lucro) **sobre o custo**. Portanto a nota só precisa fornecer, de forma
confiável: **custo unitário, código, descrição, data de emissão, fornecedor**.
Impostos extraídos da nota são guardados apenas para referência/auditoria.

## 4. Fluxo do usuário

1. Login (e-mail/senha).
2. **Importar:** arrasta um ou vários arquivos `.xml` e/ou `.pdf`.
3. Sistema faz parse → extrai linhas de produto (código, descrição, unidade,
   custo unitário, data da nota, fornecedor).
4. **Preview** do que foi extraído antes de salvar; usuário confirma.
5. Itens são salvos em `itens_nota`. Itens com `cProd` já conhecido são
   **auto-vinculados** ao produto mestre; o resto entra na fila de vínculo.
6. **Vincular itens:** fila de itens não vinculados → usuário liga cada um a um
   produto mestre (escolhe existente ou cria). O vínculo `cProd → mestre` é
   memorizado para o futuro.
7. **Produtos:** busca por nome/código → mostra preço de venda, maior custo dos
   últimos 3 meses, nota/data de origem, nº de notas no período.
8. **Exportar:** Excel ou PDF da tabela de preços.
9. **Configurações:** edita os percentuais do markup; afeta todos os preços.

## 5. Modelo de dados (Supabase)

### `notas`
NF importada. Campos: `id`, `numero`, `chave` (nullable p/ PDF), `fornecedor`,
`data_emissao`, `origem` (`xml` | `pdf`), `arquivo_nome`, `created_at`.

### `itens_nota`
Linha bruta de produto de uma nota (histórico). Campos: `id`, `nota_id` (FK),
`cprod`, `descricao`, `unidade`, `custo_unitario`, `quantidade`,
`vicms`, `vipi`, `vpis`, `vcofins` (referência), `produto_mestre_id` (FK,
nullable até vincular), `created_at`.

### `produtos_mestre`
Produto canônico exibido no painel. Campos: `id`, `nome`, `categoria` (opcional),
`created_at`.

### `vinculos_cprod`
Memória de auto-vínculo. Campos: `cprod` (PK), `produto_mestre_id` (FK),
`created_at`. Quando uma nota nova traz um `cprod` presente aqui, o item já
nasce vinculado.

### `config_markup`
Linha única com os percentuais. Campos espelham `PricingPercentages`:
`vendas`, `marketing`, `custo_operacional`, `ipi`, `icms`, `pis`, `cofins`,
`csll`, `ir`, `lucro`, `desgaste_maquinas`, `frete`. Valores default do
cost-to-love (vendas 7, marketing 5, custo_op 20, ipi 5.2, icms 18, pis 1.65,
cofins 7.6, csll 9, ir 25, lucro 20).

**RLS:** todas as tabelas exigem usuário autenticado para leitura/escrita.

## 6. Cálculo do preço (regra dos 3 meses)

Para cada `produto_mestre`:

1. Buscar todos os `itens_nota` vinculados a ele cuja `nota.data_emissao` esteja
   nos **últimos 3 meses** (hoje − 3 meses, janela móvel).
2. Selecionar o **maior `custo_unitario`** desse conjunto.
3. `calculateSellingPrice(maiorCusto, configMarkup, frete)` → `precoVenda`.
4. Exibir: `precoVenda`, `maiorCusto`, nota/data de origem, nº de notas no período.

Se o produto não tem nenhum item nos últimos 3 meses → marcar como
**"sem custo recente"** (sem preço calculado, badge de aviso).

A fórmula (`pricing.ts`) usa divisor tributário:
`divisor = 1 − despesas% − icms%×(1+ipi%) − pis% − cofins% − lucroBruto%`,
`precoBase = custo / divisor`, com `lucroBruto = lucroLíquido / (1 − csll% − ir%)`.
Portada sem alteração de lógica.

## 7. Parsing das notas

### XML (caminho exato)
Porta o parser de NF-e existente em `cost-to-love/parsers.ts` (`DOMParser`,
tags `<det>/<prod>`: `cProd`, `xProd`, `qCom`, `vUnCom`, `uCom`; cabeçalho:
emitente, data emissão, número). Cobre `nfeProc`/`infNFe`.

### PDF DANFE (best-effort)
Extrai texto do PDF (pdf.js) e identifica a tabela de itens (código, descrição,
unidade, valor unitário). Reusa heurísticas de `parseInvoiceFromText` do
cost-to-love. Falhas de parse são exibidas no preview para correção manual
antes de salvar. Sem custo extraível → item descartado com aviso.

## 8. Telas

- **Login** — Supabase Auth (e-mail/senha).
- **Importar** — dropzone multi-arquivo + preview editável + botão salvar.
- **Vincular itens** — fila de itens não vinculados; ação: ligar a mestre
  existente ou criar novo; mostra quantos serão auto-vinculados.
- **Produtos** — busca + tabela (mestre, preço venda, maior custo, origem,
  nº notas, badges) + botões Exportar Excel / Exportar PDF.
- **Configurações** — formulário dos percentuais do markup.

## 9. Exportação

- **Excel:** biblioteca `xlsx` (já usada no cost-to-love). Colunas: produto,
  categoria, maior custo, preço venda, data do custo, nº notas no período.
- **PDF:** geração client-side (jsPDF ou print-to-PDF), mesma tabela, cabeçalho
  com logo Live e data de geração.

## 10. Estratégia de testes (TDD)

- **Parser XML:** fixtures de NF-e reais → asserta cProd, descrição, custo,
  data, fornecedor.
- **Parser PDF:** fixtures de DANFE → asserta produto + custo unitário;
  asserta descarte quando custo ausente.
- **Motor de markup:** custo conhecido + percentuais default → preço esperado
  (reusa/porta `pricing.test.ts`).
- **Regra dos 3 meses:** dado um mestre com itens em datas variadas, asserta que
  o preço usa o maior custo dentro da janela e ignora itens fora dela.
- **Auto-vínculo:** item com `cprod` conhecido nasce vinculado; desconhecido vai
  para a fila.

## 11. Segurança e LGPD

- Dados de custo/markup são sensíveis → acesso só autenticado (RLS).
- Sem `.env` no git; chaves Supabase fixadas, `service_role` nunca no front-end.
- Dependências seguem o protocolo de segurança (cooldown 7 dias, versão fixada).

## 12. Fora de escopo (YAGNI)

- Integração com Nomus API (esta ferramenta é por arquivo, por design).
- Níveis de acesso/roles (login simples basta por ora).
- Markup por categoria/produto (config única basta por ora).
- DRE / Apuração de impostos (isso é o cost-to-love).
