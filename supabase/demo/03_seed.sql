-- ============================================================================
-- Social Dashboard — base de DEMONSTRAÇÃO
-- 03: dados fictícios (empresa fictícia "Aurora Tech"). Reproduzível (setseed).
-- Gera ~24 meses até a data atual: posts de 7 redes × 13 países + followers.
-- Pode ser rodado de novo: limpa e recria os dados de demo.
-- ============================================================================

truncate public.posts, public.followers, public.youtube_manual_log, public.paises;

insert into public.paises (pais, grupo) values
  ('Argentina','Latam'), ('Brazil','Latam'), ('Chile','Latam'), ('Colombia','Latam'),
  ('Ecuador','Latam'), ('México','Latam'), ('Perú','Latam'), ('Uruguay','Latam'),
  ('Benelux','Benelux'),
  ('France','Countrys'), ('Portugal','Countrys'), ('Spain','Countrys'), ('US','Countrys');

-- Usuários de demonstração (crie logins com estes e-mails no Supabase Auth ou troque pelo seu)
insert into public.user_roles (email, nome, role, criado_por) values
  ('admin@exemplo.com.br',  'Admin Demo',  'root',   'seed'),
  ('editor@exemplo.com.br', 'Editor Demo', 'editor', 'seed'),
  ('viewer@exemplo.com.br', 'Viewer Demo', 'viewer', 'seed')
on conflict (email) do nothing;

select setseed(0.42);

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
with redes(rede, posts_mes, escala, tipos, url) as (
  values
    ('Linkedin',        30, 9.2, array['Imagem','Vídeo','Documento','Artigo','Texto'],   'https://www.exemplo.com/linkedin/post/'),
    ('Facebook',        22, 8.6, array['Foto','Vídeo','Link','Status'],                  'https://www.exemplo.com/facebook/post/'),
    ('Instagram',       20, 8.9, array['Imagem','Carrossel','Reels'],                    'https://www.exemplo.com/instagram/p/'),
    ('Instagram Story', 15, 7.6, array['Story'],                                         'https://www.exemplo.com/instagram/s/'),
    ('Tiktok',          10, 9.6, array['Vídeo'],                                         'https://www.exemplo.com/tiktok/v/'),
    ('Twitter',         25, 7.9, array['Tweet','Retweet','Thread'],                      'https://www.exemplo.com/x/status/'),
    ('Youtube',          6, 8.8, array['Vídeo','Shorts','Live'],                         'https://www.exemplo.com/youtube/watch/')
),
paises as (select array_agg(pais order by pais) l from public.paises),
temas(l) as (values (array[
  'inteligência artificial','computação em nuvem','cibersegurança','dados e analytics',
  'sustentabilidade','transformação digital','IA generativa','experiência do cliente',
  'diversidade e inclusão','carreiras','automação','5G e IoT'])),
setores(l) as (values (array['varejo','saúde','finanças','energia','manufatura','setor público','telecom','seguros'])),
modelos(l) as (values (array[
  'Aurora Tech anuncia nova parceria em %s para o setor de %s',
  'Como %s está transformando o setor de %s',
  '5 tendências de %s para %s em 2026',
  'Case: %s acelera resultados no setor de %s',
  'Webinar: o futuro de %s no setor de %s',
  'Nosso time de %s conquista prêmio no setor de %s',
  'Vagas abertas: venha trabalhar com %s (%s)',
  'Relatório Aurora Tech: maturidade em %s no setor de %s'])),
hashtags(l) as (values (array[
  '#AuroraTechGlobal','#AuroraTechGermany','#AuroraTechUK','#AuroraTechSwitzerland',
  '#AuroraTechBrasil','#AuroraTechLatam','#InteligenciaArtificial','#Cloud','#Ciberseguranca',
  '#DataAnalytics','#Sustentabilidade','#Inovacao','#Carreiras','#TransformacaoDigital'])),
calendario as (
  select generate_series(date_trunc('month', current_date) - interval '23 months',
                         date_trunc('month', current_date), interval '1 month')::date mes
),
base as (
  select r.rede, r.escala, r.tipos, r.url, c.mes, g.n,
         random() r1, random() r2, random() r3, random() r4, random() r5, random() r6, random() r7
  from redes r cross join calendario c
  cross join lateral generate_series(1, r.posts_mes) g(n)
),
gerado as (
  select
    b.*,
    b.mes + floor(b.r1 * least(28, current_date - b.mes + 1))::int dia,
    (select l[1 + floor(b.r2 * cardinality(l))::int] from paises) pais,
    (select l[1 + floor(b.r3 * cardinality(l))::int] from temas) tema,
    (select l[1 + floor(b.r4 * cardinality(l))::int] from setores) setor,
    (select l[1 + floor(b.r5 * cardinality(l))::int] from modelos) modelo,
    case when b.r6 < 0.12 then null
         else (select l[1 + floor(b.r6 * cardinality(l))::int] from hashtags) end hashtag,
    b.tipos[1 + floor(b.r7 * cardinality(b.tipos))::int] tipo,
    -- crescimento de ~25% ao ano + ruído log-normal
    round(exp(b.escala + (random() - 0.5) * 1.6)
          * (1 + 0.25 * extract(epoch from b.mes - (current_date - interval '24 months')) / 31536000))::bigint imp
  from base b
)
insert into public.posts (id, rede, titulo, texto, tipo_post, link_post, data_publicacao, hashtag, pais,
                          impressoes, alcance, interacoes, visualizacoes, alcance_estimado, extras)
select
  id, rede, titulo, titulo || '. Saiba mais no nosso blog. ' || coalesce(hashtag, ''),
  tipo, url || id, dia, hashtag, pais,
  imp, alc, inter,
  case when rede in ('Instagram','Instagram Story','Tiktok','Youtube') or tipo ilike '%vídeo%'
       then round(imp * (0.4 + random() * 0.5))::bigint end,
  rede = 'Instagram Story',
  case rede
    when 'Linkedin'  then jsonb_build_object('reacoes', round(inter*0.70), 'comentarios', round(inter*0.08),
                                             'reposts', round(inter*0.05), 'cliques', round(inter*0.17),
                                             'nomeConta', 'Aurora Tech ' || pais)
    when 'Facebook'  then jsonb_build_object('reacoes', round(inter*0.65), 'comentarios', round(inter*0.10),
                                             'compartilhamentos', round(inter*0.08), 'cliquesLink', round(inter*0.17))
    when 'Instagram' then jsonb_build_object('curtidas', round(inter*0.80), 'comentarios', round(inter*0.07),
                                             'itensSalvos', round(inter*0.08), 'compartilhamentos', round(inter*0.05))
    when 'Instagram Story' then jsonb_build_object('navegacao', round(inter*0.6), 'toquesEmStickers', round(inter*0.1),
                                             'respostas', round(inter*0.05), 'visitasAoPerfil', round(inter*0.25))
    when 'Tiktok'    then jsonb_build_object('curtidas', round(inter*0.85), 'comentarios', round(inter*0.06),
                                             'compartilhamentos', round(inter*0.09), 'duracao', (15 + floor(random()*75))::int || 's')
    when 'Twitter'   then jsonb_build_object('curtidas', round(inter*0.60), 'respostas', round(inter*0.08),
                                             'reposts', round(inter*0.12), 'cliquesNaUrl', round(inter*0.20))
    when 'Youtube'   then jsonb_build_object('gostei', round(inter*0.75), 'comentarios', round(inter*0.10),
                                             'inscricoesObtidas', round(inter*0.15), 'duracao', (1 + floor(random()*20))::int || 'min')
  end
from (
  select g.*,
         lower(replace(g.rede, ' ', '')) || '-' || to_char(g.dia, 'YYYYMMDD') || '-' || lpad(g.n::text, 3, '0') id,
         format(g.modelo, g.tema, g.setor) titulo,
         round(g.imp * (0.55 + random() * 0.35))::bigint alc,
         round(g.imp * (0.008 + random() * 0.06))::bigint inter
  from gerado g
) x;

-- ---------------------------------------------------------------------------
-- Followers: fim de cada mês × país × canal, com crescimento mensal
-- ---------------------------------------------------------------------------
with canais(canal, base) as (
  values ('Linkedin', 60000), ('Facebook', 35000), ('Instagram', 28000),
         ('Tiktok', 9000), ('Twitter', 15000), ('Youtube', 6000)
),
peso_pais as (
  select pais, 0.3 + random() * 1.7 peso from public.paises
),
meses as (
  select (generate_series(date_trunc('month', current_date) - interval '23 months',
                          date_trunc('month', current_date) - interval '1 month', interval '1 month')
          + interval '1 month - 1 day')::date data,
         row_number() over () - 1 i
)
insert into public.followers (data, pais, canal, seguidores, atualizado_por)
select m.data, p.pais, c.canal,
       round(c.base * p.peso * power(1 + (0.005 + random() * 0.02), m.i))::bigint,
       'seed'
from meses m cross join peso_pais p cross join canais c;

-- Resumo
select rede, count(*) posts, min(data_publicacao), max(data_publicacao) from public.posts group by rede order by rede;
select count(*) linhas_followers, min(data), max(data) from public.followers;
