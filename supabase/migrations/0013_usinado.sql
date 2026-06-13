-- 0013_usinado.sql — Calculador de peças USINADAS (trefilado + plástico + mão de obra)
-- config_bitolas: cada bitola aponta um produto do catálogo (custo) + medida da barra.
--   trefilado: produto em R$/kg, barra 6000mm, peso_barra_kg informado.
--   plástico:  produto em R$/un (barra 1m), barra 1000mm, peso_barra_kg null.
-- pecas_usinado: receita por peça usinada (bitolas + comprimento + mão de obra).

create table if not exists public.config_bitolas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('trefilado', 'plastico')),
  nome text not null,
  produto_mestre_id uuid references public.produtos_mestre(id) on delete set null,
  comprimento_barra_mm numeric not null,
  peso_barra_kg numeric null
);

create table if not exists public.pecas_usinado (
  produto_mestre_id uuid primary key references public.produtos_mestre(id) on delete cascade,
  bitola_trefilado_id uuid null references public.config_bitolas(id) on delete set null,
  bitola_plastico_id uuid null references public.config_bitolas(id) on delete set null,
  comprimento_mm numeric not null default 0,
  mao_de_obra numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.config_bitolas enable row level security;
drop policy if exists "auth_all_config_bitolas" on public.config_bitolas;
create policy "auth_all_config_bitolas" on public.config_bitolas
  for all to authenticated using (true) with check (true);

alter table public.pecas_usinado enable row level security;
drop policy if exists "auth_all_pecas_usinado" on public.pecas_usinado;
create policy "auth_all_pecas_usinado" on public.pecas_usinado
  for all to authenticated using (true) with check (true);
