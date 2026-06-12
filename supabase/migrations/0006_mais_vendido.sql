-- 0006_mais_vendido.sql — marca de "mais vendido" por produto
alter table public.produtos_mestre
  add column if not exists mais_vendido boolean not null default false;

create index if not exists idx_produtos_mestre_mais_vendido
  on public.produtos_mestre (mais_vendido)
  where mais_vendido = true;
