-- ============================================================================
-- Social Dashboard — base de DEMONSTRAÇÃO
-- 02: RPCs com o MESMO contrato (nomes, parâmetros e formato JSON) que
--     src/lib/social.functions.ts e src/lib/users.functions.ts consomem.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._posts_filtrados(
  p_redes    text[],
  p_inicio   date,
  p_fim      date,
  p_hashtags text[],
  p_tipos    text[],
  p_busca    text
) returns setof public.posts
language sql stable as $$
  select p.*
  from public.posts p
  where (p_redes is null
         or p.rede = any (p_redes)
         or ('Instagram' = any (p_redes) and p.rede = 'Instagram Story'))
    and (p_inicio   is null or p.data_publicacao >= p_inicio)
    and (p_fim      is null or p.data_publicacao <= p_fim)
    and (p_hashtags is null or p.hashtag   = any (p_hashtags))
    and (p_tipos    is null or p.tipo_post = any (p_tipos))
    and (p_busca    is null or p.titulo ilike '%' || p_busca || '%'
                            or p.texto  ilike '%' || p_busca || '%')
$$;

create or replace function public._post_json(p public.posts)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id',               p.id,
    'rede',             p.rede,
    'titulo',           p.titulo,
    'texto',            p.texto,
    'tipo_post',        p.tipo_post,
    'linkPost',         p.link_post,
    'link_post',        p.link_post,
    'data_publicacao',  to_char(p.data_publicacao, 'YYYY-MM-DD'),
    'hashtag',          p.hashtag,
    'pais',             p.pais,
    'impressoes',       p.impressoes,
    'alcance',          p.alcance,
    'interacoes',       p.interacoes,
    'eng_rate',         case when p.impressoes > 0 then round(p.interacoes::numeric / p.impressoes, 6) end,
    'engRate',          case when p.impressoes > 0 then round(p.interacoes::numeric / p.impressoes, 6) end,
    'alcanceEstimado',  p.alcance_estimado,
    'visualizacoes',    p.visualizacoes,
    'extras',           p.extras
  )
$$;

create or replace function public._role_de(p_email text)
returns text language sql stable as $$
  select coalesce(
    (select role from public.user_roles where lower(email) = lower(p_email) and ativo),
    'viewer')
$$;

-- ---------------------------------------------------------------------------
-- Redes
-- ---------------------------------------------------------------------------
create or replace function public.rpc_network_overview(
  p_rede text, p_inicio date default null, p_fim date default null,
  p_hashtags text[] default null, p_tipos text[] default null, p_busca text default null
) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posts',      count(*),
    'impressoes', coalesce(sum(impressoes), 0),
    'alcance',    coalesce(sum(alcance), 0),
    'interacoes', coalesce(sum(interacoes), 0),
    'eng_rate',   case when sum(impressoes) > 0
                       then round(sum(interacoes)::numeric / sum(impressoes), 6) else 0 end)
  from public._posts_filtrados(array[p_rede], p_inicio, p_fim, p_hashtags, p_tipos, p_busca)
$$;

create or replace function public.rpc_posts(
  p_rede text default null, p_inicio date default null, p_fim date default null,
  p_hashtags text[] default null, p_tipos text[] default null, p_busca text default null,
  p_limit int default 200, p_offset int default 0
) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public._post_json(t) order by t.data_publicacao desc, t.id), '[]'::jsonb)
  from (
    select * from public._posts_filtrados(
      case when p_rede is null then null else array[p_rede] end,
      p_inicio, p_fim, p_hashtags, p_tipos, p_busca)
    order by data_publicacao desc, id
    limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ) t
$$;

create or replace function public.rpc_dimensions(p_rede text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (
    select * from public._posts_filtrados(
      case when p_rede is null then null else array[p_rede] end, null, null, null, null, null)
  )
  select jsonb_build_object(
    'hashtags', coalesce((select jsonb_agg(h order by h) from (select distinct hashtag h from b where hashtag is not null) x), '[]'),
    'tipos',    coalesce((select jsonb_agg(t order by t) from (select distinct tipo_post t from b where tipo_post is not null) x), '[]'),
    'paises',   coalesce((select jsonb_agg(c order by c) from (select distinct pais c from b where pais is not null) x), '[]'))
$$;

create or replace function public.rpc_posts_date_bounds()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'minDate', to_char(min(data_publicacao), 'YYYY-MM-DD'),
    'maxDate', to_char(max(data_publicacao), 'YYYY-MM-DD'))
  from public.posts
$$;

-- ---------------------------------------------------------------------------
-- Followers
-- ---------------------------------------------------------------------------
create or replace function public.rpc_followers_dimensions()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'countries', coalesce((select jsonb_agg(x order by x) from (select distinct pais  x from public.followers) s), '[]'),
    'channels',  coalesce((select jsonb_agg(x order by x) from (select distinct canal x from public.followers) s), '[]'),
    'fys',       coalesce((select jsonb_agg(x order by x) from (select distinct fy    x from public.followers) s), '[]'),
    'latestFy',  (select fy from public.followers order by data desc limit 1),
    'minDate',   (select to_char(min(data), 'YYYY-MM-DD') from public.followers),
    'maxDate',   (select to_char(max(data), 'YYYY-MM-DD') from public.followers))
$$;

create or replace function public.rpc_followers_overview(
  p_inicio date default null, p_fim date default null,
  p_paises text[] default null, p_canais text[] default null, p_fys text[] default null
) returns jsonb
language sql stable security definer set search_path = public as $$
  with f as (
    select * from public.followers
    where (p_inicio is null or data >= p_inicio)
      and (p_fim    is null or data <= p_fim)
      and (p_paises is null or pais  = any (p_paises))
      and (p_canais is null or canal = any (p_canais))
      and (p_fys    is null or fy    = any (p_fys))
  ),
  ultimo as (            -- valor mais recente de cada país × canal (regra: Followers no MAX(data))
    select distinct on (pais, canal) pais, canal, seguidores
    from f order by pais, canal, data desc
  ),
  mensal as (            -- último valor de cada mês por país × canal
    select distinct on (to_char(data, 'YYYY-MM'), pais, canal)
           to_char(data, 'YYYY-MM') ym, pais, canal, seguidores
    from f order by to_char(data, 'YYYY-MM'), pais, canal, data desc
  )
  select jsonb_build_object(
    'total',      coalesce((select sum(seguidores) from ultimo), 0),
    'refDate',    (select to_char(max(data), 'YYYY-MM-DD') from f),
    'perChannel', coalesce((select jsonb_agg(jsonb_build_object('channel', canal, 'total', t) order by t desc)
                            from (select canal, sum(seguidores) t from ultimo group by canal) x), '[]'),
    'perCountry', coalesce((select jsonb_agg(jsonb_build_object('country', pais, 'total', t) order by t desc)
                            from (select pais, sum(seguidores) t from ultimo group by pais) x), '[]'),
    'byChannel',  coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'channel', canal, 'total', t) order by ym, canal)
                            from (select ym, canal, sum(seguidores) t from mensal group by ym, canal) x), '[]'),
    'byCountry',  coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'country', pais, 'total', t) order by ym, pais)
                            from (select ym, pais, sum(seguidores) t from mensal group by ym, pais) x), '[]'),
    'table',      coalesce((select jsonb_agg(jsonb_build_object(
                              'date', to_char(data, 'YYYY-MM-DD'), 'country', pais, 'channel', canal,
                              'followers', seguidores, 'fy', fy) order by data desc, pais, canal)
                            from f), '[]'))
$$;

create or replace function public.rpc_upsert_followers(p_registros jsonb, p_user_email text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_ins int := 0;
  v_upd int := 0;
begin
  if public._role_de(p_user_email) not in ('root', 'admin', 'editor') then
    raise exception 'permission denied: % não pode editar Followers', p_user_email using errcode = '42501';
  end if;

  with dados as (
    select (r->>'date')::date d, r->>'country' c, r->>'channel' ch, (r->>'followers')::bigint n
    from jsonb_array_elements(p_registros) r
  ), up as (
    insert into public.followers as t (data, pais, canal, seguidores, atualizado_por)
    select d, c, ch, n, p_user_email from dados
    on conflict (data, pais, canal) do update
      set seguidores = excluded.seguidores, atualizado_por = excluded.atualizado_por, atualizado_em = now()
    returning (xmax = 0) inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido) into v_ins, v_upd from up;

  return jsonb_build_object('affected', v_ins + v_upd, 'inserted', v_ins, 'updated', v_upd);
end $$;

-- Lançamento manual do YouTube: Brasil e US diretos; o restante do total Latam
-- é distribuído entre os demais países Latam proporcionalmente ao último valor conhecido.
create or replace function public.rpc_youtube_manual(
  p_period date, p_latam bigint, p_brazil bigint, p_us bigint, p_user_email text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_resto   bigint := p_latam - p_brazil;
  v_base    numeric;
  v_dist    bigint := 0;
  v_avisos  text[] := '{}';
begin
  if public._role_de(p_user_email) not in ('root', 'admin', 'editor') then
    raise exception 'permission denied: % não pode editar Followers', p_user_email using errcode = '42501';
  end if;
  if v_resto < 0 then
    v_avisos := v_avisos || 'Brasil maior que o total Latam: nada distribuído.';
    v_resto := 0;
  end if;

  insert into public.youtube_manual_log (periodo, latam_total, brazil, us, user_email)
  values (p_period, p_latam, p_brazil, p_us, p_user_email);

  insert into public.followers (data, pais, canal, seguidores, atualizado_por)
  values (p_period, 'Brazil', 'Youtube', p_brazil, p_user_email),
         (p_period, 'US',     'Youtube', p_us,     p_user_email)
  on conflict (data, pais, canal) do update set seguidores = excluded.seguidores,
    atualizado_por = excluded.atualizado_por, atualizado_em = now();

  -- pesos: último valor de YouTube de cada país Latam (exceto Brasil)
  create temporary table _pesos on commit drop as
    select p.pais, coalesce((select f.seguidores from public.followers f
                             where f.pais = p.pais and f.canal = 'Youtube' and f.data < p_period
                             order by f.data desc limit 1), 1) peso
    from public.paises p where p.grupo = 'Latam' and p.pais <> 'Brazil';
  select sum(peso) into v_base from _pesos;

  if coalesce(v_base, 0) = 0 then
    v_avisos := v_avisos || 'Sem países Latam cadastrados para distribuir.';
  else
    insert into public.followers (data, pais, canal, seguidores, atualizado_por)
    select p_period, pais, 'Youtube', floor(v_resto * peso / v_base)::bigint, p_user_email from _pesos
    on conflict (data, pais, canal) do update set seguidores = excluded.seguidores,
      atualizado_por = excluded.atualizado_por, atualizado_em = now();
    select coalesce(sum(floor(v_resto * peso / v_base)), 0)::bigint into v_dist from _pesos;
  end if;

  return jsonb_build_object(
    'status',             case when cardinality(v_avisos) = 0 then 'ok' else 'aviso' end,
    'diretos',            p_brazil + p_us,
    'latam_distribuidos', v_dist,
    'total_regional',     p_latam + p_us,
    'diferenca',          (p_latam + p_us) - (p_brazil + p_us + v_dist),
    'avisos',             to_jsonb(v_avisos));
end $$;

-- ---------------------------------------------------------------------------
-- KPIs Report
-- ---------------------------------------------------------------------------
create or replace function public.rpc_kpis_dimensions()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'fys',       coalesce((select jsonb_agg(x order by x) from (select distinct public.fy_de(data_publicacao) x from public.posts) s), '[]'),
    'countries', coalesce((select jsonb_agg(x order by x) from (select distinct pais x from public.posts where pais is not null) s), '[]'),
    'redes',     coalesce((select jsonb_agg(x order by x) from (select distinct rede x from public.posts) s), '[]'),
    'latestFy',  (select public.fy_de(max(data_publicacao)) from public.posts))
$$;

create or replace function public.rpc_kpis_report(
  p_fy text default null, p_inicio date default null, p_fim date default null,
  p_paises text[] default null, p_redes text[] default null
) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select date_trunc('month', data_publicacao)::date mes, pais, rede, impressoes, alcance, interacoes
    from public.posts
    where (p_fy     is null or public.fy_de(data_publicacao) = p_fy)
      and (p_inicio is null or data_publicacao >= p_inicio)
      and (p_fim    is null or data_publicacao <= p_fim)
      and (p_paises is null or pais = any (p_paises))
      and (p_redes  is null or rede = any (p_redes))
  ),
  agg as (
    select mes, pais, rede, count(*) posts, sum(impressoes) imp, sum(alcance) alc, sum(interacoes) inter
    from p group by mes, pais, rede
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'date',        to_char(a.mes, 'YYYY-MM-DD'),
      'country',     a.pais,
      'channel',     a.rede,
      'posts',       a.posts,
      'impressions', a.imp,
      'reach',       a.alc,
      'engagement',  a.inter,
      'engRate',     case when a.imp > 0 then round(a.inter::numeric / a.imp, 6) else 0 end,
      'followers',   (select f.seguidores from public.followers f
                      where f.pais = a.pais and f.canal = split_part(a.rede, ' ', 1)
                        and date_trunc('month', f.data) = a.mes
                      order by f.data desc limit 1),
      'fy',          public.fy_de(a.mes))
    order by a.mes, a.pais, a.rede), '[]'::jsonb)
  from agg a
$$;

-- ---------------------------------------------------------------------------
-- Report Consolidado
-- ---------------------------------------------------------------------------
create or replace function public.rpc_consolidated_dimensions()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'redes',    coalesce((select jsonb_agg(x order by x) from (select distinct rede x from public.posts) s), '[]'),
    'hashtags', coalesce((select jsonb_agg(x order by x) from (select distinct hashtag x from public.posts where hashtag is not null) s), '[]'),
    'tipos',    coalesce((select jsonb_agg(x order by x) from (select distinct tipo_post x from public.posts where tipo_post is not null) s), '[]'))
$$;

create or replace function public.rpc_consolidated_report(
  p_redes text[] default null, p_inicio date default null, p_fim date default null,
  p_hashtags text[] default null, p_tipos text[] default null, p_busca text default null,
  p_limit int default 500, p_offset int default 0
) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (
    select * from public._posts_filtrados(p_redes, p_inicio, p_fim, p_hashtags, p_tipos, p_busca)
  )
  select jsonb_build_object(
    'kpis', (select jsonb_build_object(
               'posts', count(*), 'impressoes', coalesce(sum(impressoes), 0),
               'alcance', coalesce(sum(alcance), 0), 'interacoes', coalesce(sum(interacoes), 0),
               'engRate', case when sum(impressoes) > 0
                               then round(sum(interacoes)::numeric / sum(impressoes), 6) else 0 end)
             from b),
    'total', (select count(*) from b),
    'rows',  coalesce((select jsonb_agg(public._post_json(t) order by t.data_publicacao desc, t.id)
                       from (select * from b order by data_publicacao desc, id
                             limit greatest(p_limit, 0) offset greatest(p_offset, 0)) t), '[]'))
$$;

-- ---------------------------------------------------------------------------
-- CEO View: impressões por mês × país × rede, agrupadas em Countrys / Latam / Benelux
-- ---------------------------------------------------------------------------
create or replace function public.rpc_ceo_report(p_inicio date, p_fim date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (
    select extract(year from p.data_publicacao)::int ano, extract(month from p.data_publicacao)::int mes,
           p.pais, p.rede, p.impressoes, coalesce(g.grupo, 'Countrys') grupo
    from public.posts p left join public.paises g on g.pais = p.pais
    where p.data_publicacao between p_inicio and p_fim and p.pais is not null
  ),
  linhas as (
    select ano, mes, pais, rede, 'Countrys' grupo, sum(impressoes) imp from b group by ano, mes, pais, rede
    union all
    select ano, mes, 'Latam', rede, 'Latam', sum(impressoes) from b where grupo = 'Latam' group by ano, mes, rede
    union all
    select ano, mes, pais, rede, 'Benelux', sum(impressoes) from b where grupo = 'Benelux' group by ano, mes, pais, rede
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'ano', ano, 'mes', mes,
      'mes_nome', (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[mes],
      'pais', pais, 'impressoes', imp, 'rede', rede, 'grupo', grupo)
    order by grupo, ano, mes, pais, rede), '[]'::jsonb)
  from linhas
$$;

-- ---------------------------------------------------------------------------
-- Usuários e papéis
-- ---------------------------------------------------------------------------
create or replace function public.rpc_user_role(p_email text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email',          lower(p_email),
    'role',           r,
    'canWrite',       r in ('root', 'admin', 'editor'),
    'canManageUsers', r in ('root', 'admin'))
  from (select public._role_de(p_email) r) s
$$;

create or replace function public.rpc_user_admin_info(p_email text)
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'uid',         (select id::text from auth.users where lower(email) = lower(p_email) limit 1),
    'role',        (select role from public.user_roles where lower(email) = lower(p_email)),
    'rootsAtivos', (select count(*) from public.user_roles where role = 'root' and ativo))
$$;

create or replace function public.rpc_list_users(p_caller_email text)
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if public._role_de(p_caller_email) not in ('root', 'admin') then
    raise exception 'permission denied: % não pode listar usuários', p_caller_email using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',              coalesce(u.id::text, r.email),
      'email',           r.email,
      'nome',            r.nome,
      'role',            r.role,
      'ativo',           r.ativo,
      'criadoEm',        r.criado_em,
      'ultimoLogin',     u.last_sign_in_at,
      'convitePendente', coalesce((u.raw_user_meta_data->>'must_change_password')::boolean, u.id is null))
      order by r.email)
    from public.user_roles r
    left join auth.users u on lower(u.email) = lower(r.email)), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Permissões: RPCs só para a service_role (igual ao projeto original)
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'rpc\_%' or p.proname like '\_%')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
