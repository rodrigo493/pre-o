-- 0010_custo_composto.sql
-- Custo composto de peças fabricadas (US/TB/LA):
-- soma_nota: soma ao custo dos componentes o maior preço da nota do próprio código (3 meses).
-- tempo_corte_min: minutos de corte laser da peça (TB/LA).
-- valor_hora_laser: R$/hora do laser (config global, singleton id=1).

alter table public.produtos_mestre
  add column if not exists soma_nota boolean not null default false,
  add column if not exists tempo_corte_min numeric null;

alter table public.config_markup
  add column if not exists valor_hora_laser numeric not null default 0;
