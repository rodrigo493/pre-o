-- 0001_init.sql — Tabela de Preços a partir de NF

create table public.produtos_mestre (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  tipo text not null default 'comprado' check (tipo in ('comprado','montado')),
  custo_manual numeric,
  preco_manual numeric,
  created_at timestamptz not null default now()
);

create table public.notas (
  id uuid primary key default gen_random_uuid(),
  numero text,
  chave text,
  fornecedor text,
  data_emissao date not null,
  origem text not null check (origem in ('xml','pdf')),
  arquivo_nome text,
  created_at timestamptz not null default now()
);

create table public.itens_nota (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas(id) on delete cascade,
  cprod text not null,
  descricao text not null,
  unidade text,
  custo_unitario numeric not null,
  quantidade numeric,
  vicms numeric, vipi numeric, vpis numeric, vcofins numeric,
  produto_mestre_id uuid references public.produtos_mestre(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.itens_nota (produto_mestre_id);
create index on public.itens_nota (cprod);

create table public.vinculos_cprod (
  cprod text primary key,
  produto_mestre_id uuid not null references public.produtos_mestre(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.config_markup (
  id int primary key default 1 check (id = 1),
  vendas numeric not null default 7,
  marketing numeric not null default 5,
  custo_operacional numeric not null default 20,
  ipi numeric not null default 5.2,
  icms numeric not null default 18,
  pis numeric not null default 1.65,
  cofins numeric not null default 7.6,
  csll numeric not null default 9,
  ir numeric not null default 25,
  lucro numeric not null default 20,
  desgaste_maquinas numeric not null default 0,
  frete numeric not null default 0
);
insert into public.config_markup (id) values (1) on conflict do nothing;

-- RLS: tudo exige usuário autenticado
alter table public.produtos_mestre enable row level security;
alter table public.notas enable row level security;
alter table public.itens_nota enable row level security;
alter table public.vinculos_cprod enable row level security;
alter table public.config_markup enable row level security;

do $$
declare t text;
begin
  foreach t in array array['produtos_mestre','notas','itens_nota','vinculos_cprod','config_markup']
  loop
    execute format(
      'create policy "auth_all_%1$s" on public.%1$I for all to authenticated using (true) with check (true);', t
    );
  end loop;
end $$;
