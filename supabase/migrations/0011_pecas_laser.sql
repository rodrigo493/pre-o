-- 0011_pecas_laser.sql — Calculador de custo de peças LA (chapa laser)
-- config_chapas: mapa espessura → chapa do catálogo + área da chapa + peso.
-- pecas_laser: receita por peça LA (espessura, medidas, tempo). Custo é recalculado
-- na aplicação: material = (área_peça/área_chapa) × (R$/kg da chapa nas notas × peso)
--               laser   = (tempo_corte_seg/3600) × valor_hora_laser.

create table if not exists public.config_chapas (
  espessura numeric primary key,
  chapa_codigo text not null,
  area_mm2 numeric not null,
  peso_kg numeric not null
);

insert into public.config_chapas (espessura, chapa_codigo, area_mm2, peso_kg) values
  (1.2,  'CH.LISA.1200X3000X1,2MM', 3600000, 34),
  (2.0,  'CH.LISA.1200X3000X2,0MM', 3600000, 56.8),
  (3.17, 'CH.LISA.1200X3000X3,00MM', 3600000, 85),
  (4.76, 'CH.LISA.1500X3000X4,75MM', 4500000, 169),
  (6.35, 'CH.LISA.1500X3000X6,30MM', 4500000, 223)
on conflict (espessura) do update
  set chapa_codigo = excluded.chapa_codigo,
      area_mm2 = excluded.area_mm2,
      peso_kg = excluded.peso_kg;

create table if not exists public.pecas_laser (
  produto_mestre_id uuid primary key references public.produtos_mestre(id) on delete cascade,
  espessura numeric not null references public.config_chapas(espessura),
  largura_mm numeric not null,
  comprimento_mm numeric not null,
  tempo_corte_seg numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.config_chapas enable row level security;
drop policy if exists "auth_all_config_chapas" on public.config_chapas;
create policy "auth_all_config_chapas" on public.config_chapas
  for all to authenticated using (true) with check (true);

alter table public.pecas_laser enable row level security;
drop policy if exists "auth_all_pecas_laser" on public.pecas_laser;
create policy "auth_all_pecas_laser" on public.pecas_laser
  for all to authenticated using (true) with check (true);
