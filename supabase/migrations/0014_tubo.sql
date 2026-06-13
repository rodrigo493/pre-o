-- 0014_tubo.sql — Calculador de TUBOS + seed das bitolas (tubo e trefilado)
-- Tubo: material da barra (comprimento/6000 × R$/kg × peso) + corte a laser (tempo × valor-hora).
-- Reaproveita config_bitolas (tipo passa a aceitar 'tubo'). pecas_tubo guarda a receita.

alter table public.config_bitolas drop constraint if exists config_bitolas_tipo_check;
alter table public.config_bitolas
  add constraint config_bitolas_tipo_check check (tipo in ('trefilado', 'plastico', 'tubo'));

create unique index if not exists idx_config_bitolas_tipo_nome on public.config_bitolas (tipo, nome);

create table if not exists public.pecas_tubo (
  produto_mestre_id uuid primary key references public.produtos_mestre(id) on delete cascade,
  bitola_id uuid null references public.config_bitolas(id) on delete set null,
  comprimento_mm numeric not null default 0,
  tempo_corte_seg numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.pecas_tubo enable row level security;
drop policy if exists "auth_all_pecas_tubo" on public.pecas_tubo;
create policy "auth_all_pecas_tubo" on public.pecas_tubo
  for all to authenticated using (true) with check (true);

-- Seed das bitolas (barra 6000mm). produto_mestre_id fica null: apontar na tela depois.
insert into public.config_bitolas (tipo, nome, comprimento_barra_mm, peso_barra_kg) values
  ('trefilado', 'Trefilado 4.76',   6000, 1),
  ('trefilado', 'Trefilado 6.35',   6000, 1.5),
  ('trefilado', 'Trefilado 12.7',   6000, 6),
  ('trefilado', 'Trefilado 15.875', 6000, 9.4),
  ('trefilado', 'Trefilado 19.05',  6000, 13.6),
  ('trefilado', 'Trefilado 22.22',  6000, 18.5),
  ('trefilado', 'Trefilado 25.4',   6000, 24.1),
  ('tubo', 'Redondo 76.2x2',  6000, 22.1),
  ('tubo', 'Redondo 50.8x2',  6000, 14.53),
  ('tubo', 'Redondo 38.1x2',  6000, 10.75),
  ('tubo', 'Redondo 31.8x2',  6000, 8.88),
  ('tubo', 'Redondo 25.4x2',  6000, 6.97),
  ('tubo', 'Redondo 22.22x2', 6000, 6.1),
  ('tubo', 'Quadrado 100x40x2', 6000, 25.79),
  ('tubo', 'Quadrado 80x40x2',  6000, 22),
  ('tubo', 'Quadrado 50x50x2.0', 6000, 18.2),
  ('tubo', 'Quadrado 40x40x2',  6000, 14.41),
  ('tubo', 'Quadrado 50x30x2',  6000, 14.41),
  ('tubo', 'Quadrado 30x30x2',  6000, 10.62),
  ('tubo', 'Cantoneira 1"x1/8"',     6000, 8.3),
  ('tubo', 'Cantoneira 1.1/2"x1/8"', 6000, 11.1),
  ('tubo', 'Cantoneira 3/4"x1/8"',   6000, 5.29),
  ('tubo', 'Ferro chato 1.1/2"x3/16"', 6000, 8.5)
on conflict (tipo, nome) do update
  set comprimento_barra_mm = excluded.comprimento_barra_mm,
      peso_barra_kg = excluded.peso_barra_kg;
