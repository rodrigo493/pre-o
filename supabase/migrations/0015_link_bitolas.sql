-- 0015_link_bitolas.sql — liga bitolas de TUBO aos produtos do catálogo (por código)
-- e cadastra os PLÁSTICOS (tarugos, barra 1000mm). Só liga o que existir em produtos_mestre.

-- Tubos: aponta produto_mestre_id pela correspondência nome da bitola → código do catálogo.
update public.config_bitolas b
   set produto_mestre_id = p.id
  from public.produtos_mestre p
 where b.tipo = 'tubo'
   and p.codigo = case b.nome
     when 'Redondo 76.2x2'         then 'RED.76.2X2'
     when 'Redondo 50.8x2'         then 'RED.50.8X2'
     when 'Redondo 38.1x2'         then 'RED.38.1X2'
     when 'Redondo 31.8x2'         then 'RED.31.8X2'
     when 'Redondo 25.4x2'         then 'RED.25.4X2'
     when 'Quadrado 100x40x2'      then 'RET.100X40X2,00'
     when 'Quadrado 80x40x2'       then 'RET.80X40X2MM'
     when 'Quadrado 50x50x2.0'     then 'QUAD.50X50X2.0'
     when 'Quadrado 40x40x2'       then 'QUAD.40X40X2'
     when 'Quadrado 50x30x2'       then 'RET.50X30X2'
     when 'Quadrado 30x30x2'       then 'QUAD.30X30X2'
     when 'Cantoneira 1.1/2"x1/8"' then 'CA.38.1X3.17'
     when 'Cantoneira 3/4"x1/8"'   then 'CA.19.05X3.17'
     when 'Ferro chato 1.1/2"x3/16"' then 'FCH 1.1/2x3/16'
     else null
   end;

-- Plásticos (tarugos, barra de 1m). Cadastra cada um já ligado ao produto.
insert into public.config_bitolas (tipo, nome, comprimento_barra_mm, produto_mestre_id)
select 'plastico', x.nome, 1000, p.id
  from (values
    ('UHMW 30x1000',                'UHMW.30X1000'),
    ('Poliacetal preto 16x1000',    'PP.097'),
    ('Polipropileno 90x1000',       'PP.096'),
    ('Polipropileno preto 40x1000', 'PP.095'),
    ('Polipropileno preto 13x1000', 'PP.094'),
    ('Polipropileno preto 20x1000', 'PP.093'),
    ('Nylon preto 16x1000',         'NY.016'),
    ('PP preto 30x1000',            'PP.092'),
    ('Nylon preto 20x1000',         'NY.020'),
    ('Nylon preto 50x1000',         'NY.050')
  ) as x(nome, codigo)
  join public.produtos_mestre p on p.codigo = x.codigo
on conflict (tipo, nome) do update set produto_mestre_id = excluded.produto_mestre_id;
