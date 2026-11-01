# Base de demonstração (dados fictícios)

Este projeto roda sobre uma base Supabase **100% fictícia** (empresa "Aurora Tech"),
com as mesmas RPCs e o mesmo formato de resposta usados pelo app.

## Como subir

1. Crie um projeto no [Supabase](https://supabase.com) (o plano gratuito basta).
2. No **SQL Editor**, rode na ordem:
   - `01_schema.sql` — tabelas (`posts`, `followers`, `user_roles`, `paises`, `youtube_manual_log`)
   - `02_rpcs.sql` — 16 RPCs (`rpc_posts`, `rpc_network_overview`, `rpc_followers_overview`, `rpc_kpis_report`, `rpc_ceo_report`…)
   - `03_seed.sql` — ~3 mil posts em 7 redes × 13 países nos últimos 24 meses + série de seguidores
3. Em **Authentication → Users**, crie um usuário `admin@exemplo.com.br` (papel `root` no seed)
   ou troque o e-mail em `user_roles` pelo seu.
4. Copie `.env.example` para `.env` e preencha com a URL e as chaves do seu projeto
   (Project Settings → API). `SB_DATA_SERVICE_KEY` é a **service_role** e fica só no servidor.

O `03_seed.sql` pode ser rodado de novo a qualquer momento: ele recria os dados de demonstração
com datas relativas ao dia atual.

## O que não está na demo

- Sincronização com Google Drive (Edge Function `drive-sync`)
- Envio de e-mails de convite (Resend): sem `RESEND_API_KEY`, o app só mostra a senha temporária
