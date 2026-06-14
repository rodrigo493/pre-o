-- 0016_link_trefilados.sql — liga as bitolas de TREFILADO aos produtos do catálogo (por código).
-- Trefilados: grupo "12 - TREFILADOS", comprado em R$/kg, barra de 6m.

update public.config_bitolas b
   set produto_mestre_id = p.id
  from public.produtos_mestre p
 where b.tipo = 'trefilado'
   and p.codigo = case b.nome
     when 'Trefilado 4.76'   then 'FRM.TRE.4,76MM'
     when 'Trefilado 6.35'   then 'FRM.TRE.6,35MM'
     when 'Trefilado 12.7'   then 'FRM.TRE.12,70MM'
     when 'Trefilado 15.875' then 'FRM.TRE.15.87 1020'
     when 'Trefilado 19.05'  then 'FRM.TRE.19.05'
     when 'Trefilado 22.22'  then 'FRM.TRE.22.22'
     when 'Trefilado 25.4'   then 'FRM.TRE.25.4'
     else null
   end;
