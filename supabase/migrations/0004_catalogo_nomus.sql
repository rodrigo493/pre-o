-- 0004_catalogo_nomus.sql — Catálogo Nomus + conversão de unidade
-- Adiciona unidade/unidade_secundária/fator de conversão e índice único em código
-- para permitir upsert do catálogo. Atualiza api_precos para converter o custo
-- da nota para a unidade principal do produto.

-- 1. Colunas novas em produtos_mestre
alter table public.produtos_mestre add column if not exists unidade text;
alter table public.produtos_mestre add column if not exists unidade_secundaria text;
alter table public.produtos_mestre add column if not exists fator_conversao numeric;

-- 2. Índice único em código (índice comum: NULL != NULL no Postgres, então
--    permite vários NULL e mantém código único). NÃO usar índice PARCIAL aqui:
--    o upsert do Supabase (ON CONFLICT (codigo)) não casa com índice parcial.
drop index if exists idx_produtos_mestre_codigo;
create unique index if not exists idx_produtos_mestre_codigo_uq
  on public.produtos_mestre (codigo);

-- 3. api_precos: aplica a conversão de unidade no maior custo dos 3 meses.
--    custo_convertido = custo_unitario * fator_conversao quando a unidade da nota
--    casa com a unidade secundária do produto e há fator definido.
create or replace function public.api_precos(api_key text)
returns table (
  id uuid,
  codigo text,
  nome text,
  categoria text,
  tipo text,
  preco_venda numeric,
  custo numeric,
  margem_percent numeric,
  status text,
  data_custo date,
  num_notas int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.config_markup%rowtype;
  m   public.produtos_mestre%rowtype;
  v_maior numeric;
  v_num   int;
  v_data  date;
  desp numeric; icmsdiv numeric; lucrob numeric; divisor numeric; base numeric;
  v_preco numeric; v_custo numeric; v_status text; v_margem numeric;
begin
  if api_key is null
     or api_key <> (select ac.price_api_key from public.api_config ac where ac.id = 1) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into cfg from public.config_markup cm where cm.id = 1;

  desp    := (cfg.vendas + cfg.marketing + cfg.custo_operacional + cfg.desgaste_maquinas) / 100.0;
  icmsdiv := (cfg.icms / 100.0) * (1 + cfg.ipi / 100.0);
  lucrob  := (cfg.lucro / 100.0) / (1 - cfg.csll / 100.0 - cfg.ir / 100.0);
  divisor := 1 - desp - icmsdiv - cfg.pis / 100.0 - cfg.cofins / 100.0 - lucrob;

  for m in select * from public.produtos_mestre pm order by pm.nome loop
    -- maior custo (já convertido) e nº de notas na janela de 3 meses
    select max(
             case
               when m.fator_conversao is not null and m.fator_conversao > 0
                    and m.unidade_secundaria is not null
                    and upper(btrim(coalesce(i.unidade, ''))) = upper(btrim(m.unidade_secundaria))
               then i.custo_unitario * m.fator_conversao
               else i.custo_unitario
             end
           ),
           count(distinct i.nota_id)
      into v_maior, v_num
      from public.itens_nota i
      join public.notas n on n.id = i.nota_id
     where i.produto_mestre_id = m.id
       and n.data_emissao >= (current_date - interval '3 months');
    v_num := coalesce(v_num, 0);

    v_data := null;
    if v_maior is not null then
      select n.data_emissao into v_data
        from public.itens_nota i
        join public.notas n on n.id = i.nota_id
       where i.produto_mestre_id = m.id
         and n.data_emissao >= (current_date - interval '3 months')
         and (case
                when m.fator_conversao is not null and m.fator_conversao > 0
                     and m.unidade_secundaria is not null
                     and upper(btrim(coalesce(i.unidade, ''))) = upper(btrim(m.unidade_secundaria))
                then i.custo_unitario * m.fator_conversao
                else i.custo_unitario
              end) = v_maior
       order by n.data_emissao desc
       limit 1;
    end if;

    v_preco := null; v_custo := null; v_status := null; v_margem := null;

    if m.preco_manual is not null then
      v_preco  := m.preco_manual;
      v_custo  := case when m.tipo = 'montado' then m.custo_manual else v_maior end;
      v_status := 'travado';
    elsif m.tipo = 'montado' then
      v_preco  := null;
      v_custo  := m.custo_manual;
      v_status := 'sem_preco_manual';
    else
      if v_maior is null then
        v_status := 'sem_custo_recente';
      else
        v_custo  := v_maior;
        base     := v_maior / divisor;
        v_preco  := base + base * (cfg.ipi / 100.0);
        v_status := 'ok';
      end if;
    end if;

    if v_preco is not null and v_custo is not null and v_preco > 0 then
      v_margem := (v_preco - v_custo) / v_preco * 100;
    end if;

    id             := m.id;
    codigo         := m.codigo;
    nome           := m.nome;
    categoria      := m.categoria;
    tipo           := m.tipo;
    preco_venda    := v_preco;
    custo          := v_custo;
    margem_percent := v_margem;
    status         := v_status;
    data_custo     := case when m.tipo = 'montado' then null else v_data end;
    num_notas      := case when m.tipo = 'montado' then 0 else v_num end;
    return next;
  end loop;
end;
$$;

grant execute on function public.api_precos(text) to anon;
