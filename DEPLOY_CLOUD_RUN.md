# Deploy do dashboard no Google Cloud Run

Guia para publicar o app (TanStack Start / Node) no Cloud Run, a partir do repositório GitHub.
Serve de modelo para os próximos dashboards de clientes.

- **Projeto GCP:** `meu-projeto-gcp`
- **Região:** `southamerica-east1` (São Paulo)
- **Serviço:** `aurora-tech-dashboard`
- **Backend Supabase (auth + dados):** `demougerrqircyikzyla`

---

## 1. Abrir o Cloud Shell

1. Entre em https://console.cloud.google.com com a conta dona do projeto `meu-projeto-gcp`.
2. No seletor de projetos (topo), selecione **meu-projeto-gcp**.
3. Clique no ícone do **Cloud Shell** (terminal, canto superior direito). Aguarde ~30s na primeira vez.

## 2. Apontar o projeto e ligar os serviços

```bash
gcloud config set project meu-projeto-gcp

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

## 3. Clonar o repositório (privado)

O repo é privado, então autentique no GitHub primeiro (o `gh` já vem no Cloud Shell):

```bash
gh auth login
# Escolha: GitHub.com → HTTPS → autenticar pelo navegador (código exibido na tela)

gh repo clone edusilverio/aurora-tech-dashboard
cd aurora-tech-dashboard
```

## 4. Deploy (constrói a imagem e publica)

Um comando faz tudo: envia o código ao Cloud Build, que constrói o `Dockerfile`,
guarda a imagem no Artifact Registry e publica no Cloud Run.

> Antes de rodar, troque `COLE_A_SERVICE_ROLE_AQUI` pela chave **service_role** do
> projeto arwj (Supabase → Settings → API → `service_role` → Reveal/Copy). É a única chave secreta.

```bash
gcloud run deploy aurora-tech-dashboard \
  --source . \
  --region southamerica-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars SUPABASE_URL=https://exemplo-projeto.supabase.co,SUPABASE_PUBLISHABLE_KEY=<JWT_REMOVIDO>,SB_DATA_URL=https://exemplo-projeto.supabase.co,SB_DATA_SERVICE_KEY=COLE_A_SERVICE_ROLE_AQUI
```

- Se perguntar para **criar um repositório no Artifact Registry**, responda **Y**.
- `--allow-unauthenticated`: o serviço fica público, porque o login é feito **dentro do app** (Supabase). Sem isso, ninguém acessa a tela de login.
- O primeiro build leva alguns minutos. No fim, ele imprime a **Service URL** (algo como `https://aurora-tech-dashboard-xxxx.a.run.app`).

## 5. Ajustar o Auth do Supabase para a nova URL

Para o login e o "esqueci minha senha" funcionarem no novo endereço:

1. Supabase (projeto arwj) → **Authentication → URL Configuration**.
2. **Site URL:** a Service URL do Cloud Run.
3. **Redirect URLs:** adicione `https://SUA-SERVICE-URL/reset-password` (e a raiz `https://SUA-SERVICE-URL/*`).

## 6. Testar

Abra a Service URL, faça login (usuário root/viewer do arwj) e valide as páginas
(Followers, redes, CEO, KPIs, Sincronizar). Deve ficar idêntico ao Lovable.

---

## Atualizar o app depois (nova versão)

Sempre que houver mudança no código (push no GitHub):

```bash
cd aurora-tech-dashboard && git pull
gcloud run deploy aurora-tech-dashboard --source . --region southamerica-east1
```
(As env vars já ficam salvas no serviço; não precisa repassar.)

## Publicar outro cliente no mesmo projeto

É só outro serviço, com outro nome e outro backend Supabase:

```bash
gh repo clone edusilverio/OUTRO-REPO && cd OUTRO-REPO
gcloud run deploy CLIENTE-X-dashboard --source . --region southamerica-east1 \
  --allow-unauthenticated --port 8080 \
  --set-env-vars SUPABASE_URL=...,SUPABASE_PUBLISHABLE_KEY=...,SB_DATA_URL=...,SB_DATA_SERVICE_KEY=...
```

## Reforço de segurança (opcional, depois de estar no ar)

Guardar a `service_role` no **Secret Manager** em vez de env var em texto:

```bash
echo -n "SUA_SERVICE_ROLE" | gcloud secrets create sb-data-service-key --data-file=-
gcloud run services update aurora-tech-dashboard --region southamerica-east1 \
  --update-secrets SB_DATA_SERVICE_KEY=sb-data-service-key:latest \
  --remove-env-vars SB_DATA_SERVICE_KEY
# conceda ao service account do Cloud Run o papel roles/secretmanager.secretAccessor
```
