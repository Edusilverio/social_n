import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2, Youtube } from "lucide-react";
import { getYoutubeOverview, getYoutubeHashtags, getYoutubePostTypes, getPostsDateBounds } from "@/lib/social.functions";
import { SocialFilters, type SocialFilterValues } from "./SocialFilters";
import { KpiCard } from "./KpiCard";
import { PostsTable } from "./PostsTable";

export function YoutubePage() {
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

  const fetchOverview = useServerFn(getYoutubeOverview);
  const fetchHashtags = useServerFn(getYoutubeHashtags);
  const fetchPostTypes = useServerFn(getYoutubePostTypes);

  const overview = useQuery({
    queryKey: ["yt-overview", filters],
    queryFn: () =>
      fetchOverview({
        data: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          hashtags: filters.hashtags,
          postTypes: filters.postTypes,
          search: filters.search,
        },
      }),
    staleTime: 5 * 60 * 1000,
    enabled: dateDefaultsApplied,
  });

  const hashtags = useQuery({
    queryKey: ["yt-hashtags"],
    queryFn: () => fetchHashtags({ data: undefined as never }),
    staleTime: 60 * 60 * 1000,
  });
  const postTypes = useQuery({
    queryKey: ["yt-postTypes"],
    queryFn: () => fetchPostTypes({ data: undefined as never }),
    staleTime: 60 * 60 * 1000,
  });

  const filterDefaults = useMemo<SocialFilterValues>(() => {
    const iso = bounds.data?.maxDate;
    if (!iso) return {};
    const base = new Date(`${iso}T00:00:00`);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      startDate: fmt(new Date(base.getFullYear(), base.getMonth(), 1)),
      endDate: fmt(new Date(base.getFullYear(), base.getMonth() + 1, 0)),
    };
  }, [bounds.data?.maxDate]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FF0000] text-white">
          <Youtube className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">YouTube</h1>
          <p className="text-sm text-muted-foreground">Vídeos e engajamento — tabela Youtube_Ouro</p>
        </div>
      </header>

      <SocialFilters
        value={filters}
        onChange={setFilters}
        showPostType
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
            <KpiCard label="Alcance" value={overview.data.kpis.views} />
            <KpiCard label="Interações" value={overview.data.kpis.interactions} />
            <KpiCard label="Engajamento %" value={overview.data.kpis.engRate} format="percent" />
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
          titleLabel="Título da publicação"
          hasPostType
          hasExtras
          exportFileName="youtube-posts"
        />
      )}
    </div>
  );
}
