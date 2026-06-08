-- 0002_api_precos.sql — API aberta (com chave) da tabela de preços para o LiveCRM
-- Expõe os produtos com o preço de venda calculado (base + IPI, regra dos 3 meses,
-- override manual, montado) via PostgREST RPC: GET /rest/v1/rpc/api_precos?api_key=...
-- Protegida por uma chave de API própria (além da publishable key exigida pelo PostgREST).

-- 1. Tabela de configuração da API (guarda a chave). RLS sem policy => anon NÃO lê a chave.
create table if not exists public.api_config (
  id int primary key default 1 check (id = 1),
  price_api_key text not null
);
alter table public.api_config enable row level security;

insert into public.api_config (id, price_api_key)
values (1, 'lvprc_Hpuzu_6DWk25nSJO5yYE4qs_iQqGnIsN')
on conflict (id) do nothing;

-- 2. Função que calcula e retorna a lista de produtos + preços.
--    SECURITY DEFINER: roda como dono (bypassa RLS p/ ler as tabelas internas).
--    STABLE: permite chamada via GET no PostgREST.
create or replace function public.api_precos(api_key text)
returns table (
  id uuid,
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
  -- Checagem da chave de API (compara com a chave guardada)
  if api_key is null
     or api_key <> (select ac.price_api_key from public.api_config ac where ac.id = 1) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into cfg from public.config_markup cm where cm.id = 1;

  -- divisor tributário (mesma fórmula do pricing.ts / Lucro Real)
  desp    := (cfg.vendas + cfg.marketing + cfg.custo_operacional + cfg.desgaste_maquinas) / 100.0;
  icmsdiv := (cfg.icms / 100.0) * (1 + cfg.ipi / 100.0);
  lucrob  := (cfg.lucro / 100.0) / (1 - cfg.csll / 100.0 - cfg.ir / 100.0);
  divisor := 1 - desp - icmsdiv - cfg.pis / 100.0 - cfg.cofins / 100.0 - lucrob;

  for m in select * from public.produtos_mestre pm order by pm.nome loop
    -- janela móvel dos últimos 3 meses: maior custo + nº de notas
    select max(i.custo_unitario), count(distinct i.nota_id)
      into v_maior, v_num
      from public.itens_nota i
      join public.notas n on n.id = i.nota_id
     where i.produto_mestre_id = m.id
       and n.data_emissao >= (current_date - interval '3 months');
    v_num := coalesce(v_num, 0);

    -- data de emissão do item de maior custo (origem)
    v_data := null;
    if v_maior is not null then
      select n.data_emissao into v_data
        from public.itens_nota i
        join public.notas n on n.id = i.nota_id
       where i.produto_mestre_id = m.id
         and n.data_emissao >= (current_date - interval '3 months')
         and i.custo_unitario = v_maior
       order by n.data_emissao desc
       limit 1;
    end if;

    v_preco := null; v_custo := null; v_status := null; v_margem := null;

    -- prioridade: override manual > montado > comprado (regra dos 3 meses)
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
        v_preco  := base + base * (cfg.ipi / 100.0);  -- preço = base + IPI
        v_status := 'ok';
      end if;
    end if;

    if v_preco is not null and v_custo is not null and v_preco > 0 then
      v_margem := (v_preco - v_custo) / v_preco * 100;
    end if;

    id             := m.id;
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

-- 3. Permitir que a publishable key (role anon) execute a função.
grant execute on function public.api_precos(text) to anon;
