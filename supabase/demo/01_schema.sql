-- ============================================================================
-- Social Dashboard — base de DEMONSTRAÇÃO (dados 100% fictícios)
-- 01: tabelas
-- Rode no SQL Editor do seu projeto Supabase, na ordem 01 → 02 → 03.
-- ============================================================================

-- Ano fiscal: começa em abril (abr/2025–mar/2026 = FY26)
create or replace function public.fy_de(d date)
returns text language sql immutable as $$
  select 'FY' || to_char((d + interval '9 months')::date, 'YY')
$$;

-- Posts de todas as redes (camada "ouro" consolidada)
create table if not exists public.posts (
  id               text primary key,
  rede             text not null,               -- Linkedin | Facebook | Instagram | Instagram Story | Tiktok | Twitter | Youtube
  titulo           text,
  texto            text,
  tipo_post        text,
  link_post        text,
  data_publicacao  date not null,
  hashtag          text,
  pais             text,
  impressoes       bigint  not null default 0,
  alcance          bigint  not null default 0,
  interacoes       bigint  not null default 0,
  visualizacoes    bigint,
  alcance_estimado boolean not null default false,
  extras           jsonb   not null default '{}'::jsonb
);
create index if not exists posts_rede_data_idx on public.posts (rede, data_publicacao);
create index if not exists posts_hashtag_idx   on public.posts (hashtag);

-- Seguidores por data × país × canal
create table if not exists public.followers (
  data            date   not null,
  pais            text   not null,
  canal           text   not null,
  seguidores      bigint not null check (seguidores >= 0),
  fy              text   generated always as (public.fy_de(data)) stored,
  atualizado_por  text,
  atualizado_em   timestamptz not null default now(),
  primary key (data, pais, canal)
);

-- Papéis de acesso do dashboard
create table if not exists public.user_roles (
  email      text primary key,
  nome       text,
  role       text not null default 'viewer' check (role in ('viewer', 'editor', 'admin', 'root')),
  ativo      boolean not null default true,
  criado_por text,
  criado_em  timestamptz not null default now()
);

-- Log de lançamentos manuais do YouTube
create table if not exists public.youtube_manual_log (
  id          bigserial primary key,
  periodo     date   not null,
  latam_total bigint not null,
  brazil      bigint not null,
  us          bigint not null,
  user_email  text,
  criado_em   timestamptz not null default now()
);

-- Grupos de país usados no CEO View
create table if not exists public.paises (
  pais  text primary key,
  grupo text not null check (grupo in ('Countrys', 'Latam', 'Benelux'))
);

-- Dados só via RPC (service_role). Nada exposto para anon/authenticated.
alter table public.posts              enable row level security;
alter table public.followers          enable row level security;
alter table public.user_roles         enable row level security;
alter table public.youtube_manual_log enable row level security;
alter table public.paises             enable row level security;
