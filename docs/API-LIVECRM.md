# API de Preços — Integração LiveCRM

API aberta (protegida por chave) que devolve a **lista de produtos com o preço de venda calculado**. Pensada para o LiveCRM consumir no **PA, PD e orçamento**.

## Endpoint

```
GET https://idttiidpqsxvpfcfjefx.supabase.co/rest/v1/rpc/api_precos?api_key=<CHAVE_API>
```

### Cabeçalhos obrigatórios
| Header | Valor |
|---|---|
| `apikey` | a **publishable key** do projeto (`sb_publishable_qXn_HEj65xHQVO75xgeu-Q_Bsz6YrbR`) |
| `Authorization` | `Bearer sb_publishable_qXn_HEj65xHQVO75xgeu-Q_Bsz6YrbR` |
| `Accept` | `application/json` |

> A `apikey`/Bearer é a chave pública do Supabase (exigida pelo PostgREST). A proteção real é a **`api_key`** abaixo, que só você e o LiveCRM conhecem.

### Parâmetro
| Param | Descrição |
|---|---|
| `api_key` | **Chave da API de preços** (segredo). Atual: `lvprc_Hpuzu_6DWk25nSJO5yYE4qs_iQqGnIsN` |

Se a `api_key` estiver errada/ausente → erro `unauthorized` (HTTP 4xx), sem devolver dados.

## Exemplo (curl)

```bash
curl "https://idttiidpqsxvpfcfjefx.supabase.co/rest/v1/rpc/api_precos?api_key=lvprc_Hpuzu_6DWk25nSJO5yYE4qs_iQqGnIsN" \
  -H "apikey: sb_publishable_qXn_HEj65xHQVO75xgeu-Q_Bsz6YrbR" \
  -H "Authorization: Bearer sb_publishable_qXn_HEj65xHQVO75xgeu-Q_Bsz6YrbR" \
  -H "Accept: application/json"
```

## Resposta (JSON — array de produtos)

```json
[
  {
    "id": "uuid-do-produto",
    "nome": "Reformer Studio",
    "categoria": "Reformer",
    "tipo": "comprado",
    "preco_venda": 1106.09,
    "custo": 100.00,
    "margem_percent": 91.0,
    "status": "ok",
    "data_custo": "2026-05-01",
    "num_notas": 2
  },
  {
    "id": "uuid-montado",
    "nome": "Combo Studio Classic",
    "categoria": "Combo",
    "tipo": "montado",
    "preco_venda": 2500.00,
    "custo": 1000.00,
    "margem_percent": 60.0,
    "status": "travado",
    "data_custo": null,
    "num_notas": 0
  }
]
```

### Campos
| Campo | Significado |
|---|---|
| `id` | ID do produto mestre |
| `nome` | Nome do produto |
| `categoria` | Categoria (pode ser `null`) |
| `tipo` | `comprado` (markup sobre NF) ou `montado` (montado por vocês) |
| `preco_venda` | **Preço de venda** = base + IPI (impostos e lucro embutidos). `null` quando sem preço |
| `custo` | Maior custo dos últimos 3 meses (comprado) ou custo manual (montado) |
| `margem_percent` | Margem sobre o preço de venda, em % |
| `status` | `ok` · `travado` (preço manual) · `sem_custo_recente` (comprado sem NF nos 3 meses) · `sem_preco_manual` (montado sem preço) |
| `data_custo` | Data da nota de origem do maior custo (comprado) |
| `num_notas` | Nº de notas no período de 3 meses |

> **Para orçamento/PD/PA:** use `nome` + `preco_venda`. Ignore itens com `preco_venda: null` (sem preço definido). Filtre por `status === "ok"` ou `"travado"` se quiser só produtos precificáveis.

## Segurança / rotação da chave

- A `api_key` é o segredo. Para **trocar** a chave, rode no SQL Editor do Supabase:
  ```sql
  update public.api_config set price_api_key = 'nova_chave_aqui' where id = 1;
  ```
- A função roda como `SECURITY DEFINER` e só devolve a lista calculada — o LiveCRM **não** acessa custos brutos, notas nem a configuração de markup.
- A tabela `api_config` tem RLS sem policy: a chave **não** é legível pela API pública.
