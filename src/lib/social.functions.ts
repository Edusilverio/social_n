import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "@/lib/social-data.server";

// ============================================================
// Camada de dados social — Supabase dedicado (RPCs Postgres).
// A UI consome exatamente as mesmas assinaturas do antigo arquivo
// bigquery.functions.ts. Toda regra de negócio (Eng%, Followers no
// MAX(data), FY calculado) vive no banco — não recalcular no front.
// ============================================================

const NULL_HASHTAG = "__NULL__";
// Permissão de escrita em Followers vem exclusivamente da tabela user_roles
// no banco (via rpc_user_role / rpc_upsert_followers). Não usar allowlist local.
const FOLLOWERS_CHANNELS = ["Facebook", "Instagram", "Linkedin", "Tiktok", "Twitter", "Youtube"] as const;

const REDE_UI_TO_DB: Record<string, string> = {
  linkedin: "Linkedin",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "Tiktok",
  twitter: "Twitter",
  youtube: "Youtube",
};

// Filtro do UI é INCLUSÃO: `p_hashtags` / `p_tipos` recebem SOMENTE os valores
// selecionados. `null`/`undefined` = sem filtro (traz tudo). Array vazio = nada.
// NULL_HASHTAG é um marcador de "sem hashtag" e é descartado antes do envio.
function toListParam(list?: string[]): string[] | null {
  if (!list) return null;
  const filtered = list.filter((v) => v !== NULL_HASHTAG);
  if (filtered.length === 0) return list.length === 0 ? [] : null;
  return filtered;
}

// ------------------------------------------------------------
// Overviews de rede (Linkedin/Facebook/Instagram/TikTok/X/YouTube)
// ------------------------------------------------------------

type OverviewRpc = {
  posts: number | string;
  impressoes: number | string;
  alcance: number | string;
  interacoes: number | string;
  eng_rate: number | string | null;
};

type PostRpc = {
  id?: string | number | null;
  rede?: string | null;
  titulo?: string | null;
  texto?: string | null;
  tipoPost?: string | null;
  tipo_post?: string | null;
  linkPost?: string | null;
  link?: string | null;
  dataPublicacao?: string | null;
  data_publicacao?: string | null;
  data?: string | null;
  hashtag?: string | null;
  pais?: string | null;
  impressoes?: number | string | null;
  alcance?: number | string | null;
  interacoes?: number | string | null;
  engRate?: number | string | null;
  eng_rate?: number | string | null;
  alcanceEstimado?: boolean | null;
  visualizacoes?: number | string | null;
  extras?: Record<string, string | number | boolean | null> | null;
};

const num = (v: unknown, fallback = 0): number => {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const nullableNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchOverview(rede: string, args: {
  startDate?: string;
  endDate?: string;
  hashtags?: string[];
  postTypes?: string[];
  search?: string;
}): Promise<OverviewRpc> {
  const data = await callRpc<OverviewRpc | OverviewRpc[]>("rpc_network_overview", {
    p_rede: rede,
    p_inicio: args.startDate ?? null,
    p_fim: args.endDate ?? null,
    p_hashtags: toListParam(args.hashtags),
    p_tipos: toListParam(args.postTypes),
    p_busca: args.search?.trim() || null,
  });
  const row = Array.isArray(data) ? data[0] ?? ({} as OverviewRpc) : data ?? ({} as OverviewRpc);
  return row;
}

async function fetchPosts(rede: string | null, args: {
  startDate?: string;
  endDate?: string;
  hashtags?: string[];
  postTypes?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<PostRpc[]> {
  const data = await callRpc<PostRpc[]>("rpc_posts", {
    p_rede: rede,
    p_inicio: args.startDate ?? null,
    p_fim: args.endDate ?? null,
    p_hashtags: toListParam(args.hashtags),
    p_tipos: toListParam(args.postTypes),
    p_busca: args.search?.trim() || null,
    p_limit: args.limit ?? 200,
    p_offset: args.offset ?? 0,
  });
  return Array.isArray(data) ? data : [];
}

async function fetchDimensions(rede: string | null): Promise<{
  hashtags: string[];
  tipos: string[];
  paises: string[];
}> {
  const raw = await callRpc<unknown>("rpc_dimensions", { p_rede: rede });
  // rpc_dimensions retorna jsonb (objeto direto). Defensivamente aceita também
  // o formato antigo (array de 1 linha) caso algum cache/PostgREST devolva TABLE.
  const obj =
    (Array.isArray(raw)
      ? (raw[0] as Record<string, unknown> | undefined)
      : (raw as Record<string, unknown> | null)) ?? {};
  const asArr = (v: unknown): string[] =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
  const dims = {
    hashtags: asArr(obj.hashtags),
    tipos: asArr(obj.tipos),
    paises: asArr(obj.paises),
  };
  console.log(
    `[social] rpc_dimensions(${rede ?? "null"}) → hashtags=${dims.hashtags.length} tipos=${dims.tipos.length} paises=${dims.paises.length}`,
  );
  return dims;
}

// ---- Linkedin / Facebook / Instagram --------------------------------

const FiltersSchema = z.object({
  network: z.enum(["linkedin", "facebook", "instagram"]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  postType: z.string().optional(),
  postTypes: z.array(z.string()).optional(),
});

export const getNetworkOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const rede = REDE_UI_TO_DB[data.network];
    const [kpi, posts] = await Promise.all([
      fetchOverview(rede, data),
      fetchPosts(rede, { ...data, limit: 200, offset: 0 }),
    ]);
    const isInstagram = data.network === "instagram";
    return {
      kpis: {
        posts: num(kpi.posts),
        impressions: num(kpi.impressoes),
        reach: num(kpi.alcance),
        interactions: num(kpi.interacoes),
        engRate: num(kpi.eng_rate),
      },
      meta: {
        hasPostType: true,
        hasPostId: data.network !== "linkedin",
        hasExtras: true,
        hasRede: isInstagram,
      },
      posts: posts.map((p) => ({
        titulo: p.titulo ?? p.texto ?? null,
        link: p.linkPost ?? p.link ?? null,
        data: p.data_publicacao ?? p.dataPublicacao ?? p.data ?? null,
        impressions: num(p.impressoes),
        reach: num(p.alcance),
        interactions: num(p.interacoes),
        engRate: nullableNum(p.engRate ?? p.eng_rate) ?? 0,
        hashtag: p.hashtag ?? null,
        postType: p.tipoPost ?? p.tipo_post ?? null,
        postId: p.id != null ? String(p.id) : null,
        alcanceEstimado: p.alcanceEstimado ?? undefined,
        visualizacoes: nullableNum(p.visualizacoes),
        extras: (p.extras ?? {}) as Record<string, string | number | boolean | null>,
        ...(isInstagram ? { rede: p.rede ?? "Instagram" } : {}),
      })),
    };
  });

export const getHashtags = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ network: z.enum(["linkedin", "facebook", "instagram"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const dims = await fetchDimensions(REDE_UI_TO_DB[data.network]);
    return dims.hashtags;
  });

export const getPostTypes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ network: z.enum(["linkedin", "facebook", "instagram"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const dims = await fetchDimensions(REDE_UI_TO_DB[data.network]);
    return dims.tipos;
  });

// ---- TikTok --------------------------------------------------------

const TiktokFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  search: z.string().optional(),
});

export const getTiktokOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TiktokFiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const [kpi, posts] = await Promise.all([
      fetchOverview("Tiktok", data),
      fetchPosts("Tiktok", { ...data, limit: 500 }),
    ]);
    return {
      kpis: {
        posts: num(kpi.posts),
        // TikTok usa Visualizações no lugar de Impressões — a RPC já entrega em `impressoes`.
        views: num(kpi.impressoes),
        reach: num(kpi.alcance),
        interactions: num(kpi.interacoes),
        engRate: num(kpi.eng_rate),
      },
      posts: posts.map((p) => ({
        titulo: p.titulo ?? p.texto ?? null,
        link: p.linkPost ?? p.link ?? null,
        data: p.data_publicacao ?? p.dataPublicacao ?? p.data ?? null,
        impressions: num(p.impressoes),
        reach: num(p.alcance),
        interactions: num(p.interacoes),
        engRate: nullableNum(p.engRate ?? p.eng_rate),
        hashtag: p.hashtag ?? null,
        postType: p.tipoPost ?? p.tipo_post ?? null,
        alcanceEstimado: p.alcanceEstimado ?? undefined,
        visualizacoes: nullableNum(p.visualizacoes),
        extras: (p.extras ?? {}) as Record<string, string | number | boolean | null>,
      })),
    };
  });

export const getTiktokHashtags = createServerFn({ method: "POST" }).handler(async () => {
  return (await fetchDimensions("Tiktok")).hashtags;
});

// ---- Twitter / X --------------------------------------------------

const XFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  postTypes: z.array(z.string()).optional(),
  search: z.string().optional(),
});

export const getXOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => XFiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const [kpi, posts] = await Promise.all([
      fetchOverview("Twitter", data),
      fetchPosts("Twitter", { ...data, limit: 500 }),
    ]);
    return {
      kpis: {
        posts: num(kpi.posts),
        impressions: num(kpi.impressoes),
        reach: num(kpi.alcance),
        interactions: num(kpi.interacoes),
        engRate: num(kpi.eng_rate),
      },
      posts: posts.map((p) => ({
        texto: p.texto ?? p.titulo ?? null,
        link: p.linkPost ?? p.link ?? null,
        data: p.data_publicacao ?? p.dataPublicacao ?? p.data ?? null,
        impressions: num(p.impressoes),
        reach: num(p.alcance),
        interactions: num(p.interacoes),
        engRate: nullableNum(p.engRate ?? p.eng_rate),
        hashtag: p.hashtag ?? null,
        tipoPost: p.tipoPost ?? p.tipo_post ?? null,
        alcanceEstimado: p.alcanceEstimado ?? undefined,
        visualizacoes: nullableNum(p.visualizacoes),
        extras: (p.extras ?? {}) as Record<string, string | number | boolean | null>,
      })),
    };
  });

export const getXHashtags = createServerFn({ method: "POST" }).handler(async () => {
  return (await fetchDimensions("Twitter")).hashtags;
});

export const getXPostTypes = createServerFn({ method: "POST" }).handler(async () => {
  return (await fetchDimensions("Twitter")).tipos;
});

// ---- YouTube ------------------------------------------------------

const YtFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  postTypes: z.array(z.string()).optional(),
  search: z.string().optional(),
});

export const getYoutubeOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => YtFiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const [kpi, posts] = await Promise.all([
      fetchOverview("Youtube", data),
      fetchPosts("Youtube", { ...data, limit: 500 }),
    ]);
    return {
      kpis: {
        posts: num(kpi.posts),
        views: num(kpi.alcance), // YouTube: "Alcance" no UI antigo era Views
        impressions: num(kpi.impressoes),
        interactions: num(kpi.interacoes),
        engRate: num(kpi.eng_rate),
      },
      posts: posts.map((p) => ({
        titulo: p.titulo ?? null,
        link: p.linkPost ?? p.link ?? null,
        data: p.data_publicacao ?? p.dataPublicacao ?? p.data ?? null,
        impressions: num(p.impressoes),
        reach: num(p.alcance),
        interactions: num(p.interacoes),
        engRate: nullableNum(p.engRate ?? p.eng_rate),
        hashtag: p.hashtag ?? null,
        postType: p.tipoPost ?? p.tipo_post ?? null,
        alcanceEstimado: p.alcanceEstimado ?? undefined,
        visualizacoes: nullableNum(p.visualizacoes),
        extras: (p.extras ?? {}) as Record<string, string | number | boolean | null>,
      })),
    };
  });

export const getYoutubeHashtags = createServerFn({ method: "POST" }).handler(async () => {
  return (await fetchDimensions("Youtube")).hashtags;
});

export const getYoutubePostTypes = createServerFn({ method: "POST" }).handler(async () => {
  return (await fetchDimensions("Youtube")).tipos;
});

// ============================================================
// Followers
// ============================================================

const FollowersFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  channels: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  fys: z.array(z.string()).optional(),
});

export const getFollowersDimensions = createServerFn({ method: "POST" }).handler(async () => {
  const raw = await callRpc<unknown>("rpc_followers_dimensions");
  const data =
    (Array.isArray(raw)
      ? (raw[0] as Record<string, unknown> | undefined)
      : (raw as Record<string, unknown> | null)) ?? {};
  const asArr = (v: unknown): string[] =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
  const asStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    countries: asArr(data.countries),
    channels: asArr(data.channels),
    fys: asArr(data.fys),
    latestFy: asStr(data.latestFy),
    minDate: asStr(data.minDate),
    maxDate: asStr(data.maxDate),
  };
});

type FollowersOverviewRpc = {
  total?: number | string;
  refDate?: string | null;
  perChannel?: Array<{ channel: string; total: number | string }>;
  perCountry?: Array<{ country: string; total: number | string }>;
  byChannel?: Array<{ ym: string; channel: string; total: number | string }>;
  byCountry?: Array<{ ym: string; country: string; total: number | string }>;
  table?: Array<{
    date: string;
    country: string;
    channel: string;
    followers: number | string;
    fy: string;
  }>;
};

export const getFollowersOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FollowersFiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const raw = await callRpc<FollowersOverviewRpc | null>("rpc_followers_overview", {
      p_inicio: data.startDate ?? null,
      p_fim: data.endDate ?? null,
      p_paises: data.countries && data.countries.length ? data.countries : null,
      p_canais: data.channels && data.channels.length ? data.channels : null,
      p_fys: data.fys && data.fys.length ? data.fys : null,
    });
    const r: FollowersOverviewRpc = raw ?? {};
    return {
      total: num(r.total),
      refDate: r.refDate ?? null,
      perChannel: (r.perChannel ?? []).map((x) => ({ channel: x.channel, total: num(x.total) })),
      perCountry: (r.perCountry ?? []).map((x) => ({ country: x.country, total: num(x.total) })),
      byChannel: (r.byChannel ?? []).map((x) => ({
        ym: x.ym,
        channel: x.channel,
        total: num(x.total),
      })),
      byCountry: (r.byCountry ?? []).map((x) => ({
        ym: x.ym,
        country: x.country,
        total: num(x.total),
      })),
      table: (r.table ?? []).map((x) => ({
        date: x.date,
        country: x.country,
        channel: x.channel,
        followers: num(x.followers),
        fy: x.fy,
      })),
    };
  });

const InsertFollowerSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  country: z.string().min(1).max(120),
  channel: z.enum(FOLLOWERS_CHANNELS),
  followers: z.number().int().min(0),
  // fy é ignorado — o banco calcula.
  fy: z.string().optional(),
});

async function upsertFollowersRows(
  rows: Array<{ date: string; country: string; channel: string; followers: number }>,
  userEmail: string,
) {
  const payload = rows.map((r) => ({
    date: r.date,
    country: r.country,
    channel: r.channel,
    followers: r.followers,
  }));
  const res = await callRpc<
    { affected?: number; inserted?: number; updated?: number } | number | null
  >("rpc_upsert_followers", { p_registros: payload, p_user_email: userEmail });
  if (res == null) return { affected: rows.length, inserted: 0, updated: 0 };
  if (typeof res === "number") return { affected: res, inserted: 0, updated: 0 };
  return {
    affected: num(res.affected, rows.length),
    inserted: num(res.inserted),
    updated: num(res.updated),
  };
}

function extractSessionEmail(context: { claims?: unknown }): string {
  const email = (context.claims as { email?: string } | undefined)?.email;
  if (!email || typeof email !== "string") {
    throw new Error("Sessão sem e-mail válido — refaça login.");
  }
  return email;
}

function isPermissionDenied(err: unknown): boolean {
  const code = (err as { code?: string; pgCode?: string } | null)?.code
    ?? (err as { pgCode?: string } | null)?.pgCode;
  if (code === "42501") return true;
  const msg = (err as { message?: string } | null)?.message ?? "";
  return /42501|insufficient_privilege|permission denied/i.test(msg);
}

function toWriteError(err: unknown): Error {
  if (isPermissionDenied(err)) {
    return new Error("Você não tem permissão para editar Followers.");
  }
  return err instanceof Error ? err : new Error(String(err));
}

export const insertFollowerRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InsertFollowerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = extractSessionEmail(context);
    try {
      const result = await upsertFollowersRows(
        [{ date: data.date, country: data.country, channel: data.channel, followers: data.followers }],
        email,
      );
      console.log("[insertFollowerRecord] ok:", { email, result });
      return { ok: true, affected: result.affected, debug: JSON.stringify(result, null, 2) };
    } catch (err) {
      throw toWriteError(err);
    }
  });

const YoutubeManualSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-01$/),
  latamTotal: z.number().int().min(0),
  brazil: z.number().int().min(0),
  us: z.number().int().min(0),
});

type YoutubeManualRpc = {
  status?: string;
  diretos?: number | string;
  latam_distribuidos?: number | string;
  total_regional?: number | string;
  diferenca?: number | string;
  avisos?: string[];
};

export const youtubeFollowersManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => YoutubeManualSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = extractSessionEmail(context);
    try {
      const raw = await callRpc<YoutubeManualRpc | YoutubeManualRpc[] | null>(
        "rpc_youtube_manual",
        {
          p_period: data.period,
          p_latam: data.latamTotal,
          p_brazil: data.brazil,
          p_us: data.us,
          p_user_email: email,
        },
      );
      const r: YoutubeManualRpc =
        (Array.isArray(raw) ? raw[0] : raw) ?? {};
      return {
        ok: true,
        status: r.status ?? "ok",
        diretos: num(r.diretos),
        latamDistribuidos: num(r.latam_distribuidos),
        totalRegional: num(r.total_regional),
        diferenca: num(r.diferenca),
        avisos: Array.isArray(r.avisos) ? r.avisos : [],
      };
    } catch (err) {
      throw toWriteError(err);
    }
  });



const BulkUpsertFollowersSchema = z.object({
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        country: z.string().min(1),
        channel: z.enum(FOLLOWERS_CHANNELS),
        followers: z.number().int().min(0),
        fy: z.string().optional(),
      }),
    )
    .min(1)
    .max(5000),
});

const BULK_BATCH_SIZE = 500;

export const bulkUpsertFollowers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BulkUpsertFollowersSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = extractSessionEmail(context);

    let affected = 0;
    let inserted = 0;
    let updated = 0;
    const batches: Array<typeof data.rows> = [];
    for (let i = 0; i < data.rows.length; i += BULK_BATCH_SIZE) {
      batches.push(data.rows.slice(i, i + BULK_BATCH_SIZE));
    }

    try {
      for (const [idx, batch] of batches.entries()) {
        const res = await upsertFollowersRows(batch, email);
        affected += res.affected;
        inserted += res.inserted;
        updated += res.updated;
        console.log(
          `[bulkUpsertFollowers] batch ${idx + 1}/${batches.length} — rows=${batch.length} affected=${res.affected} inserted=${res.inserted} updated=${res.updated}`,
        );
      }
    } catch (err) {
      throw toWriteError(err);
    }

    console.log(
      `[bulkUpsertFollowers] ${new Date().toISOString()} — email=${email} rows=${data.rows.length} batches=${batches.length} inserted=${inserted} updated=${updated} affected=${affected}`,
    );

    return { ok: true, affected, inserted, updated, total: data.rows.length };
  });

const FOLLOWERS_COUNTRIES_ALLOWED = [
  "Argentina","Benelux","Brazil","Chile","Colombia","Ecuador","France","México",
  "Perú","Portugal","Spain","US","Uruguay",
] as const;

// FY não vai mais na payload — o banco calcula. Mantido no metadado só como referência de leitura.
const FOLLOWERS_FYS_REF = ["FY23","FY24","FY25","FY26","FY27"] as const;

export const FOLLOWERS_IMPORT_META = {
  countries: FOLLOWERS_COUNTRIES_ALLOWED,
  channels: FOLLOWERS_CHANNELS,
  fys: FOLLOWERS_FYS_REF,
} as const;

// ============================================================
// KPIs Report
// ============================================================

const KpisReportFiltersSchema = z.object({
  fy: z.string().regex(/^FY\d{2}$/).optional(),
  countries: z.array(z.string()).optional(),
  channels: z.array(z.string()).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getKpisReportDimensions = createServerFn({ method: "POST" }).handler(async () => {
  const raw = await callRpc<unknown>("rpc_kpis_dimensions");
  const data =
    (Array.isArray(raw)
      ? (raw[0] as Record<string, unknown> | undefined)
      : (raw as Record<string, unknown> | null)) ?? {};
  const asArr = (v: unknown): string[] =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
  return {
    fys: asArr(data.fys),
    countries: asArr(data.countries),
    redes: asArr(data.redes),
    latestFy: typeof data.latestFy === "string" ? data.latestFy : null,
  };
});

type KpisReportRowRpc = {
  date?: string;
  data?: string;
  country?: string;
  pais?: string;
  channel?: string;
  rede?: string;
  posts?: number | string;
  impressions?: number | string;
  impressoes?: number | string;
  reach?: number | string;
  alcance?: number | string;
  engagement?: number | string;
  interacoes?: number | string;
  engRate?: number | string;
  eng_rate?: number | string;
  followers?: number | string | null;
  fy?: string;
};

export const getKpisReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => KpisReportFiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const raw = await callRpc<KpisReportRowRpc[] | { rows?: KpisReportRowRpc[] } | null>(
      "rpc_kpis_report",
      {
        p_fy: data.fy ?? null,
        p_inicio: data.startDate ?? null,
        p_fim: data.endDate ?? null,
        p_paises: data.countries && data.countries.length ? data.countries : null,
        p_redes: data.channels && data.channels.length ? data.channels : null,
      },
    );
    const list = Array.isArray(raw) ? raw : raw?.rows ?? [];
    const rows = list.map((r) => ({
      date: String(r.date ?? r.data ?? ""),
      country: String(r.country ?? r.pais ?? ""),
      channel: String(r.channel ?? r.rede ?? ""),
      posts: num(r.posts),
      impressions: num(r.impressions ?? r.impressoes),
      reach: num(r.reach ?? r.alcance),
      engagement: num(r.engagement ?? r.interacoes),
      engRate: num(r.engRate ?? r.eng_rate),
      followers: r.followers == null ? null : num(r.followers),
      fy: String(r.fy ?? ""),
    }));
    return { rows };
  });

// ============================================================
// Report Consolidado
// ============================================================

const ConsolidatedFiltersSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hashtags: z.array(z.string()).optional(),
  redes: z.array(z.string()).optional(),
  tipos: z.array(z.string()).optional(),
  busca: z.string().optional(),
});

export const getConsolidatedDimensions = createServerFn({ method: "POST" }).handler(async () => {
  const raw = await callRpc<unknown>("rpc_consolidated_dimensions");
  const data =
    (Array.isArray(raw)
      ? (raw[0] as Record<string, unknown> | undefined)
      : (raw as Record<string, unknown> | null)) ?? {};
  const asArr = (v: unknown): string[] =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
  return {
    redes: asArr(data.redes),
    hashtags: asArr(data.hashtags),
    tipos: asArr(data.tipos),
  };
});

type ConsolidatedRpc = {
  kpis?: {
    posts?: number | string;
    impressoes?: number | string;
    alcance?: number | string;
    interacoes?: number | string;
    engRate?: number | string;
  };
  total?: number | string;
  rows?: Array<{
    id?: string | number | null;
    rede?: string | null;
    titulo?: string | null;
    tipoPost?: string | null;
    tipo_post?: string | null;
    linkPost?: string | null;
    link_post?: string | null;
    dataPublicacao?: string | null;
    data_publicacao?: string | null;
    hashtag?: string | null;
    pais?: string | null;
    impressoes?: number | string | null;
    alcance?: number | string | null;
    interacoes?: number | string | null;
    engRate?: number | string | null;
    alcanceEstimado?: boolean | null;
  }>;
};

export const getConsolidatedReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConsolidatedFiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const raw = await callRpc<ConsolidatedRpc | null>("rpc_consolidated_report", {
      p_redes: data.redes && data.redes.length ? data.redes : null,
      p_inicio: data.startDate,
      p_fim: data.endDate,
      p_hashtags: data.hashtags && data.hashtags.length ? data.hashtags : null,
      p_tipos: data.tipos && data.tipos.length ? data.tipos : null,
      p_busca: data.busca?.trim() || null,
      p_limit: 500,
      p_offset: 0,
    });
    const k = raw?.kpis ?? {};
    const list = raw?.rows ?? [];
    return {
      kpis: {
        posts: num(k.posts),
        impressions: num(k.impressoes),
        reach: num(k.alcance),
        interactions: num(k.interacoes),
        engRate: num(k.engRate),
      },
      total: num(raw?.total, list.length),
      rows: list.map((r) => ({
        titulo: r.titulo ?? "",
        rede: r.rede ?? "",
        tipo: r.tipo_post ?? r.tipoPost ?? "",
        data: r.data_publicacao ?? r.dataPublicacao ?? "",
        link: r.link_post ?? r.linkPost ?? "",
        impressions: num(r.impressoes),
        reach: num(r.alcance),
        interactions: num(r.interacoes),
        engRate: num(r.engRate),
        hashtag: r.hashtag ?? null,
        pais: r.pais ?? null,
        alcanceEstimado: r.alcanceEstimado ?? false,
      })),
    };
  });

// ============================================================
// CEO Report
// ============================================================

const CeoFiltersSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type CeoRowRpc = {
  ano?: number | string;
  mes?: number | string;
  mes_nome?: string;
  mesNome?: string;
  pais?: string;
  impressions?: number | string;
  impressoes?: number | string;
  rede?: string;
  grupo?: string;
};

export const getCeoReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CeoFiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const raw = await callRpc<CeoRowRpc[] | { rows?: CeoRowRpc[] } | null>("rpc_ceo_report", {
      p_inicio: data.startDate,
      p_fim: data.endDate,
    });
    const list = Array.isArray(raw) ? raw : raw?.rows ?? [];
    return {
      rows: list.map((r) => ({
        ano: num(r.ano),
        mes: num(r.mes),
        mesNome: String(r.mes_nome ?? r.mesNome ?? ""),
        pais: String(r.pais ?? ""),
        impressions: num(r.impressions ?? r.impressoes),
        rede: String(r.rede ?? ""),
        grupo: String(r.grupo ?? ""),
      })),
    };
  });

// ============================================================
// Diagnostics & shared bounds
// ============================================================

export const getPostsDateBounds = createServerFn({ method: "POST" }).handler(async () => {
  const raw = await callRpc<{ minDate?: string | null; maxDate?: string | null } | null>(
    "rpc_posts_date_bounds",
  );
  return { minDate: raw?.minDate ?? null, maxDate: raw?.maxDate ?? null };
});

export type UserRoleInfo = {
  email: string;
  role: "root" | "editor" | "viewer" | "admin";
  canWrite: boolean;
  canManageUsers: boolean;
};

export const getUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserRoleInfo> => {
    const email = extractSessionEmail(context);
    const raw = await callRpc<
      | {
          email?: string;
          role?: string;
          canWrite?: boolean;
          can_write?: boolean;
          canManageUsers?: boolean;
          can_manage_users?: boolean;
        }
      | null
    >("rpc_user_role", { p_email: email });
    const role = (raw?.role as UserRoleInfo["role"]) ?? "viewer";
    const canWrite =
      typeof raw?.canWrite === "boolean"
        ? raw.canWrite
        : typeof raw?.can_write === "boolean"
          ? raw.can_write
          : role === "root" || role === "editor" || role === "admin";
    const canManageUsers =
      typeof raw?.canManageUsers === "boolean"
        ? raw.canManageUsers
        : typeof raw?.can_manage_users === "boolean"
          ? raw.can_manage_users
          : role === "root" || role === "admin";
    return { email, role, canWrite, canManageUsers };
  });

export const getSocialDataDiagnostic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getDataClientRole } = await import("@/lib/social-data.server");
    const role = getDataClientRole();
    let rpcOk = false;
    let rpcError: string | null = null;
    try {
      await callRpc("rpc_posts_date_bounds");
      rpcOk = true;
    } catch (e) {
      rpcError = (e as Error).message;
    }
    return {
      keyRole: role,
      keyIsServiceRole: role === "service_role",
      hasUrl: Boolean(process.env.SB_DATA_URL ?? process.env.SUPABASE_DATA_URL),
      rpcOk,
      rpcError,
    };
  });

// ============================================================
// Drive Sync — chama a Edge Function `drive-sync` no projeto de
// DADOS (SB_DATA_URL) usando a SERVICE KEY. A autorização por
// papel é feita AQUI (server function), antes de chamar a edge.
// ============================================================

const SyncDriveSchema = z
  .object({
    rede: z.string().min(1).optional(),
    substituir: z.boolean().optional(),
  })
  .optional();

export type DriveSyncReportItem = {
  arquivo?: string;
  rede?: string;
  periodo?: string;
  status?: "concluido" | "ignorado" | "bloqueado" | "erro" | string;
  linhas_lidas?: number;
  linhas_gravadas?: number;
  linhas_descartadas?: number;
  colunas?: string[];
  mensagem?: string;
  erro?: string;
};

export type EdgeSyncResponse<T> = {
  ok: boolean;
  processados?: number;
  relatorio?: T[];
  erro?: string;
};

export type DriveSyncResult = {
  ok: boolean;
  processados?: number;
  relatorio?: DriveSyncReportItem[];
  erro?: string;
};

async function callEdgeSync<T>(
  path: string,
  body: Record<string, unknown>,
  dataUrl: string,
  serviceKey: string,
  email: string,
): Promise<EdgeSyncResponse<T> & { error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(`${dataUrl}/functions/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
        "X-Caller-Email": email,
      },
      body: JSON.stringify({ ...body, caller_email: email }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg =
      (err as Error).name === "AbortError"
        ? `Tempo esgotado ao chamar ${path}.`
        : `Falha de rede ao chamar ${path}: ${(err as Error).message}`;
    return { ok: false, error: msg, relatorio: [] };
  }
  clearTimeout(timeout);

  const text = await res.text();
  let payload: EdgeSyncResponse<T> & Record<string, unknown>;
  try {
    payload = text ? (JSON.parse(text) as EdgeSyncResponse<T>) : { ok: res.ok };
  } catch {
    return {
      ok: false,
      error: `Resposta inesperada de ${path} (HTTP ${res.status}): ${text.slice(0, 300)}`,
      relatorio: [],
    };
  }
  if (!res.ok) {
    const p = payload as {
      erro?: string;
      message?: string;
      diagnostico?: string;
      error?: string;
      msg?: string;
    };
    const parts = [
      p?.erro,
      p?.error,
      p?.message,
      p?.msg,
      p?.diagnostico ? `diagnóstico: ${p.diagnostico}` : undefined,
    ].filter(Boolean);
    const detail = parts.length ? parts.join(" — ") : text.slice(0, 500) || `HTTP ${res.status}`;
    return {
      ...(payload as EdgeSyncResponse<T>),
      ok: false,
      error: `HTTP ${res.status}: ${detail}`,
    };
  }
  return payload;
}

export const syncDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SyncDriveSchema.parse(input))
  .handler(async ({ data, context }): Promise<DriveSyncResult> => {
    // 1) Autorização por papel.
    const email = extractSessionEmail(context);
    const raw = await callRpc<
      | { email?: string; role?: string; canWrite?: boolean; can_write?: boolean }
      | null
    >("rpc_user_role", { p_email: email });
    const role = (raw?.role as "root" | "editor" | "viewer") ?? "viewer";
    const canWrite =
      typeof raw?.canWrite === "boolean"
        ? raw.canWrite
        : typeof raw?.can_write === "boolean"
          ? raw.can_write
          : role === "root" || role === "editor";
    if (!canWrite) {
      throw new Error("Você não tem permissão para sincronizar dados.");
    }

    // 2) Chamada à Edge Function drive-sync no projeto de DADOS com a SERVICE KEY.
    const dataUrl = process.env.SB_DATA_URL ?? process.env.SUPABASE_DATA_URL;
    const serviceKey =
      process.env.SB_DATA_SERVICE_KEY ?? process.env.SUPABASE_DATA_SERVICE_KEY;
    if (!dataUrl) throw new Error("SB_DATA_URL não configurado no servidor.");
    if (!serviceKey) throw new Error("SB_DATA_SERVICE_KEY não configurado no servidor.");

    const posts = await callEdgeSync<DriveSyncReportItem>(
      "drive-sync",
      data ?? {},
      dataUrl,
      serviceKey,
      email,
    );

    return {
      ok: posts.ok,
      processados: posts.processados,
      relatorio: posts.relatorio,
      erro: posts.error,
    };
  });


