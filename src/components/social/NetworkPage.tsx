import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertCircle } from "lucide-react";
import { getNetworkOverview, getHashtags, getPostTypes, getPostsDateBounds } from "@/lib/social.functions";
import { SocialFilters, NULL_HASHTAG, type SocialFilterValues } from "./SocialFilters";
import { KpiCard } from "./KpiCard";
import { PostsTable } from "./PostsTable";
import { cn } from "@/lib/utils";

interface Props {
  network: "linkedin" | "facebook" | "instagram";
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  titleLabel?: string;
  showPostType?: boolean;
  /** Hashtags que devem vir desmarcadas por padrão (excluídas da consulta inicial). */
  defaultExcludedHashtags?: string[];
}

export function NetworkPage({
  network,
  title,
  subtitle,
  icon: Icon,
  accentColor,
  titleLabel,
  showPostType,
  defaultExcludedHashtags,
}: Props) {
  const [filters, setFilters] = useState<SocialFilterValues>({});
  const [dateDefaultsApplied, setDateDefaultsApplied] = useState(false);
  const fetchBounds = useServerFn(getPostsDateBounds);
  const bounds = useQuery({
    queryKey: ["posts-date-bounds"],
    queryFn: () => fetchBounds({ data: undefined as never }),
    staleTime: 60 * 60 * 1000,
  });
  useEffect(() => {
    if (dateDefaultsApplied) return;
    const iso = bounds.data?.maxDate;
    if (!iso) return;
    const base = new Date(`${iso}T00:00:00`);
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setFilters((f) => ({ ...f, startDate: fmt(start), endDate: fmt(end) }));
    setDateDefaultsApplied(true);
  }, [bounds.data?.maxDate, dateDefaultsApplied]);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const fetchOverview = useServerFn(getNetworkOverview);
  const fetchHashtags = useServerFn(getHashtags);
  const fetchPostTypes = useServerFn(getPostTypes);

  const hashtags = useQuery({
    queryKey: ["hashtags", network],
    queryFn: () => fetchHashtags({ data: { network } }),
    staleTime: 60 * 60 * 1000,
  });

  const postTypes = useQuery({
    queryKey: ["postTypes", network],
    queryFn: () => fetchPostTypes({ data: { network } }),
    staleTime: 60 * 60 * 1000,
    enabled: !!showPostType,
  });

  // Aplica os defaults (hashtags a esconder) uma vez que a lista de hashtags carregue.
  useEffect(() => {
    if (defaultApplied) return;
    if (!defaultExcludedHashtags?.length) return;
    if (!hashtags.data) return;
    const excludedSet = new Set(defaultExcludedHashtags);
    const allWithNull = [...hashtags.data, NULL_HASHTAG];
    const selected = allWithNull.filter((h) => !excludedSet.has(h));
    setFilters((f) => ({ ...f, hashtags: selected }));
    setDefaultApplied(true);
  }, [hashtags.data, defaultExcludedHashtags, defaultApplied]);

  const overview = useQuery({
    queryKey: ["overview", network, filters],
    queryFn: () => fetchOverview({ data: { network, ...filters } }),
    staleTime: 5 * 60 * 1000,
    // Aguarda os defaults serem aplicados para não disparar 2 fetches
    enabled: dateDefaultsApplied && (!defaultExcludedHashtags?.length || defaultApplied),
  });

  const filterDefaults = useMemo<SocialFilterValues>(() => {
    const iso = bounds.data?.maxDate;
    const base = iso ? new Date(`${iso}T00:00:00`) : null;
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dateRange = base
      ? {
          startDate: fmt(new Date(base.getFullYear(), base.getMonth(), 1)),
          endDate: fmt(new Date(base.getFullYear(), base.getMonth() + 1, 0)),
        }
      : {};
    let hashtagsDefault: string[] | undefined;
    if (defaultExcludedHashtags?.length && hashtags.data) {
      const excludedSet = new Set(defaultExcludedHashtags);
      hashtagsDefault = [...hashtags.data, NULL_HASHTAG].filter((h) => !excludedSet.has(h));
    }
    return { ...dateRange, ...(hashtagsDefault ? { hashtags: hashtagsDefault } : {}) };
  }, [bounds.data?.maxDate, defaultExcludedHashtags, hashtags.data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex items-center gap-4">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", accentColor)}>
          <Icon className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </header>

      <SocialFilters
        value={filters}
        onChange={setFilters}
        showPostType={showPostType}
        hashtags={hashtags.data}
        postTypes={postTypes.data}
        defaults={filterDefaults}
      />


      {overview.isError && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Erro ao consultar BigQuery: {(overview.error as Error).message}</span>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {overview.isLoading || !overview.data ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))
        ) : (
          <>
            <KpiCard label="Posts" value={overview.data.kpis.posts} />
            <KpiCard label="Impressões" value={overview.data.kpis.impressions} />
            <KpiCard label="Alcance" value={overview.data.kpis.reach} />
            <KpiCard label="Interações" value={overview.data.kpis.interactions} />
            <KpiCard label="Engajamento" value={overview.data.kpis.engRate} format="percent" />
          </>
        )}
      </section>

      {overview.isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Consultando BigQuery…
        </div>
      ) : (
        <PostsTable
          posts={overview.data?.posts ?? []}
          titleLabel={titleLabel ?? "Título"}
          hasPostType={overview.data?.meta?.hasPostType}
          hasPostId={overview.data?.meta?.hasPostId}
          hasExtras={overview.data?.meta?.hasExtras}
          hasRede={overview.data?.meta?.hasRede}
          exportFileName={`${network}-posts`}
        />
      )}
    </div>
  );
}
