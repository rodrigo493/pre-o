-- 0005_fix_codigo_index.sql — corrige o índice único de codigo
-- O upsert do Supabase (ON CONFLICT (codigo)) NÃO funciona com índice PARCIAL
-- (where codigo is not null) — erro 42P10. Um índice único comum numa coluna
-- anulável já permite múltiplos NULL (NULL != NULL no Postgres) e funciona no upsert.

drop index if exists idx_produtos_mestre_codigo_uq;
create unique index if not exists idx_produtos_mestre_codigo_uq
  on public.produtos_mestre (codigo);
