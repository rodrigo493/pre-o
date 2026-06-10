-- 0009_conversao_op.sql — operação da conversão de custo por produto (÷ ou ×)
-- O fator do produto passa a ser aplicado SEMPRE (não depende do texto da unidade):
--   dividir    → custo_real = custo_nota / fator   (ex.: cento → unidade, fator 100)
--   multiplicar→ custo_real = custo_nota * fator   (ex.: kg → peça, fator 47,1)
-- Default 'multiplicar' para preservar o comportamento anterior (kg→peça).

alter table public.produtos_mestre
  add column if not exists conversao_op text not null default 'multiplicar'
  check (conversao_op in ('dividir','multiplicar'));

create or replace function public.api_precos(api_key text)
returns table (
  id uuid, codigo text, nome text, categoria text, tipo text,
  preco_venda numeric, custo numeric, margem_percent numeric,
  status text, data_custo date, num_notas int
)
language plpgsql stable security definer set search_path = public
as $$
declare
  cfg public.config_markup%rowtype;
  m   public.produtos_mestre%rowtype;
  v_maior numeric; v_num int; v_data date;
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
    if m.tipo = 'montado' then
      select coalesce(sum(cc.maior * cm.quantidade), 0) into v_maior
        from public.componentes_montado cm
        join public.produtos_mestre cmp on cmp.id = cm.componente_id
        left join lateral (
          select max(
            case
              when vc.fator_conversao is not null and vc.fator_conversao > 0
                then i.custo_unitario / vc.fator_conversao
              when cmp.fator_conversao is not null and cmp.fator_conversao > 0 then
                case when cmp.conversao_op = 'dividir' then i.custo_unitario / cmp.fator_conversao
                     else i.custo_unitario * cmp.fator_conversao end
              else i.custo_unitario
            end
          ) as maior
          from public.itens_nota i
          join public.notas n on n.id = i.nota_id
          left join public.vinculos_cprod vc on upper(btrim(vc.cprod)) = upper(btrim(i.cprod))
          where i.produto_mestre_id = cm.componente_id
            and n.data_emissao >= (current_date - interval '3 months')
        ) cc on true
       where cm.montado_id = m.id;
      v_num := 0; v_data := null;
    else
      select max(
               case
                 when vc.fator_conversao is not null and vc.fator_conversao > 0
                   then i.custo_unitario / vc.fator_conversao
                 when m.fator_conversao is not null and m.fator_conversao > 0 then
                   case when m.conversao_op = 'dividir' then i.custo_unitario / m.fator_conversao
                        else i.custo_unitario * m.fator_conversao end
                 else i.custo_unitario
               end
             ), count(distinct i.nota_id)
        into v_maior, v_num
        from public.itens_nota i
        join public.notas n on n.id = i.nota_id
        left join public.vinculos_cprod vc on upper(btrim(vc.cprod)) = upper(btrim(i.cprod))
       where i.produto_mestre_id = m.id
         and n.data_emissao >= (current_date - interval '3 months');
      v_num := coalesce(v_num, 0);

      v_data := null;
      if v_maior is not null then
        select n.data_emissao into v_data
          from public.itens_nota i
          join public.notas n on n.id = i.nota_id
          left join public.vinculos_cprod vc on upper(btrim(vc.cprod)) = upper(btrim(i.cprod))
         where i.produto_mestre_id = m.id
           and n.data_emissao >= (current_date - interval '3 months')
           and (case
                  when vc.fator_conversao is not null and vc.fator_conversao > 0
                    then i.custo_unitario / vc.fator_conversao
                  when m.fator_conversao is not null and m.fator_conversao > 0 then
                    case when m.conversao_op = 'dividir' then i.custo_unitario / m.fator_conversao
                         else i.custo_unitario * m.fator_conversao end
                  else i.custo_unitario
                end) = v_maior
         order by n.data_emissao desc limit 1;
      end if;
    end if;

    v_preco := null; v_custo := null; v_status := null; v_margem := null;
    if m.preco_manual is not null then
      v_preco := m.preco_manual; v_custo := v_maior; v_status := 'travado';
    elsif m.tipo = 'montado' then
      if v_maior is null or v_maior = 0 then v_status := 'sem_preco_manual'; v_custo := null;
      else v_custo := v_maior; base := v_maior / divisor; v_preco := base + base * (cfg.ipi/100.0); v_status := 'ok'; end if;
    else
      if v_maior is null then v_status := 'sem_custo_recente';
      else v_custo := v_maior; base := v_maior / divisor; v_preco := base + base * (cfg.ipi/100.0); v_status := 'ok'; end if;
    end if;

    if v_preco is not null and v_custo is not null and v_preco > 0 then
      v_margem := (v_preco - v_custo) / v_preco * 100;
    end if;

    id := m.id; codigo := m.codigo; nome := m.nome; categoria := m.categoria; tipo := m.tipo;
    preco_venda := v_preco; custo := v_custo; margem_percent := v_margem; status := v_status;
    data_custo := v_data; num_notas := v_num;
    return next;
  end loop;
end;
$$;

grant execute on function public.api_precos(text) to anon;
