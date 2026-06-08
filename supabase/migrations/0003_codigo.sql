alter table public.produtos_mestre add column if not exists codigo text;
create index if not exists idx_produtos_mestre_codigo on public.produtos_mestre (codigo);
