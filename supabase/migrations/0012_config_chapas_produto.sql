-- 0012_config_chapas_produto.sql — chapa por PRODUTO (não só por código)
-- Permite apontar cada espessura para o produto do catálogo que realmente tem o
-- custo da chapa (mesmo que esse produto não tenha o código CH.LISA…). O Calculador
-- usa este produto para ler o R$/kg e multiplica pelo peso da chapa.

alter table public.config_chapas
  add column if not exists produto_mestre_id uuid references public.produtos_mestre(id) on delete set null;
