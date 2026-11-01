import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowUpDown,
  Download,
  Loader2,
  Plus,
  Users,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
  Music2,
  Upload,
} from "lucide-react";
import { FollowersBulkImportDialog } from "./FollowersBulkImportDialog";
import * as XLSX from "xlsx";
import { formatDatePtBR } from "@/lib/format-date";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getFollowersDimensions,
  getFollowersOverview,
  insertFollowerRecord,
  getUserRole,
  youtubeFollowersManual,
} from "@/lib/social.functions";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KpiCard } from "./KpiCard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CHANNELS = ["Facebook", "Instagram", "Linkedin", "Tiktok", "Twitter", "Youtube"] as const;

function calculateFY(dateStr: string): string {
  // dateStr in YYYY-MM-DD
  const [y, m] = dateStr.split("-").map(Number);
  const fyYear = m >= 4 ? y : y - 1;
  return `FY${String(fyYear).slice(-2)}`;
}

const CHANNEL_META: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  Facebook: { color: "#1877F2", icon: Facebook },
  Instagram: { color: "#E4405F", icon: Instagram },
  Linkedin: { color: "#0A66C2", icon: Linkedin },
  Tiktok: { color: "#000000", icon: Music2 },
  Twitter: { color: "#1DA1F2", icon: Twitter },
  Youtube: { color: "#FF0000", icon: Youtube },
};

const COUNTRY_PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4",
  "#8b5cf6", "#ec4899", "#84cc16", "#0ea5e9", "#f97316",
  "#14b8a6", "#a855f7", "#facc15", "#22c55e", "#64748b",
];

interface FollowersFilters {
  startDate?: string;
  endDate?: string;
  channels?: string[];
  countries?: string[];
  fys?: string[];
}

function ChipMulti({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}) {
  const sel = new Set(selected ?? []);
  const toggle = (v: string) => {
    const next = new Set(sel);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    const arr = Array.from(next);
    onChange(arr.length ? arr : undefined);
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 && (
          <span className="text-xs text-muted-foreground">Carregando…</span>
        )}
        {options.map((opt) => {
          const active = sel.has(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function FollowersPage() {
  const { user } = useAuth();
  const fetchRole = useServerFn(getUserRole);
  const roleQuery = useQuery({
    queryKey: ["user-role", user?.email ?? null],
    queryFn: () => fetchRole({ data: undefined as never }),
    enabled: !!user?.email,
    staleTime: 5 * 60 * 1000,
  });
  const canWrite = roleQuery.data?.canWrite === true;
  const qc = useQueryClient();

  const [filters, setFilters] = useState<FollowersFilters>({});
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const fetchDims = useServerFn(getFollowersDimensions);
  const fetchOverview = useServerFn(getFollowersOverview);
  const insertFn = useServerFn(insertFollowerRecord);

  const dims = useQuery({
    queryKey: ["followers-dims"],
    queryFn: () => fetchDims({ data: undefined as never }),
    staleTime: 60 * 60 * 1000,
  });

  // Default range = month of maxDate (avoids "mês atual sem dado ainda").
  useEffect(() => {
    if (defaultsApplied) return;
    const iso = dims.data?.maxDate;
    if (!iso) return;
    const base = new Date(`${iso}T00:00:00`);
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setFilters((f) => ({ ...f, startDate: fmt(start), endDate: fmt(end) }));
    setDefaultsApplied(true);
  }, [dims.data?.maxDate, defaultsApplied]);

  const overview = useQuery({
    queryKey: ["followers-overview", filters],
    queryFn: () => fetchOverview({ data: filters }),
    staleTime: 5 * 60 * 1000,
    enabled: defaultsApplied || !!filters.startDate,
  });

  // Pivot for grouped bar charts
  const channelChartData = useMemo(() => {
    const rows = overview.data?.byChannel ?? [];
    const map = new Map<string, Record<string, any>>();
    for (const r of rows) {
      if (!map.has(r.ym)) map.set(r.ym, { ym: r.ym });
      map.get(r.ym)![r.channel] = r.total;
    }
    return Array.from(map.values()).sort((a, b) => a.ym.localeCompare(b.ym));
  }, [overview.data]);

  const channelKeys = useMemo(() => {
    const set = new Set<string>();
    overview.data?.byChannel.forEach((r) => set.add(r.channel));
    return Array.from(set);
  }, [overview.data]);

  const countryChartData = useMemo(() => {
    const rows = overview.data?.byCountry ?? [];
    const map = new Map<string, Record<string, any>>();
    for (const r of rows) {
      if (!map.has(r.ym)) map.set(r.ym, { ym: r.ym });
      map.get(r.ym)![r.country] = r.total;
    }
    return Array.from(map.values()).sort((a, b) => a.ym.localeCompare(b.ym));
  }, [overview.data]);

  const countryKeys = useMemo(() => {
    const set = new Set<string>();
    overview.data?.byCountry.forEach((r) => set.add(r.country));
    return Array.from(set);
  }, [overview.data]);

  // Table sorting
  const [sortKey, setSortKey] = useState<"date" | "country" | "channel" | "followers" | "fy">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sortedTable = useMemo(() => {
    const rows = [...(overview.data?.table ?? [])];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [overview.data, sortKey, sortDir]);

  const onSort = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "followers" || k === "date" ? "desc" : "asc");
    }
  };

  const exportCsv = () => {
    const ws = XLSX.utils.json_to_sheet(
      sortedTable.map((r) => ({
        Data: formatDatePtBR(r.date),
        País: r.country,
        Canal: r.channel,
        Seguidores: r.followers,
        "Ano Fiscal": r.fy,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Followers");
    XLSX.writeFile(wb, "followers.xlsx", { bookType: "xlsx" });
  };

  // Insert dialog
  const [openDialog, setOpenDialog] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [form, setForm] = useState({
    date: "",
    country: "",
    channel: "",
    followers: "",
  });
  const insertMut = useMutation({
    mutationFn: async () => {
      // form.date vem como "YYYY-MM-DD" do <input type="date">.
      // Não usar new Date() aqui — converte para UTC e gera offset de timezone.
      const firstOfMonth = `${form.date.slice(0, 7)}-01`;
      return insertFn({
        data: {
          date: firstOfMonth,
          country: form.country.trim(),
          channel: form.channel as (typeof CHANNELS)[number],
          followers: Number(form.followers),
          fy: calculateFY(firstOfMonth),
        },
      });
    },
    onSuccess: (res: any) => {
      const n = res?.affected ?? 1;
      toast.success(`Registro gravado com sucesso no BigQuery (${n} linha${n === 1 ? "" : "s"}).`);
      console.log("[insertFollowerRecord] success debug:\n" + (res?.debug ?? ""));
      qc.invalidateQueries({ queryKey: ["followers-overview"] });
      qc.invalidateQueries({ queryKey: ["followers-dims"] });
    },
    onError: (e: any) => {
      console.error("[insertFollowerRecord] error:", e);
      toast.error(e?.message?.split("\n")[0] ?? "Falha ao gravar registro no BigQuery", { duration: 8000 });
    },
  });


  // YouTube manual entry (root/editor only)
  const ytManualFn = useServerFn(youtubeFollowersManual);
  const [ytForm, setYtForm] = useState({ month: "", latam: "", brazil: "", us: "" });
  const ytMut = useMutation({
    mutationFn: async () => {
      const period = `${ytForm.month}-01`;
      return ytManualFn({
        data: {
          period,
          latamTotal: Number(ytForm.latam),
          brazil: Number(ytForm.brazil),
          us: Number(ytForm.us),
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        `YouTube ${ytForm.month}: ${res.diretos} diretos, ${res.latamDistribuidos} distribuídos em LATAM.`,
      );
      qc.invalidateQueries({ queryKey: ["followers-overview"] });
      qc.invalidateQueries({ queryKey: ["followers-dims"] });
    },
    onError: (e: any) => {
      toast.error(e?.message?.split("\n")[0] ?? "Falha ao gravar YouTube manual", { duration: 8000 });
    },
  });
  const ytValid =
    /^\d{4}-\d{2}$/.test(ytForm.month) &&
    [ytForm.latam, ytForm.brazil, ytForm.us].every(
      (v) => v !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0,
    );

  const formValid =
    !!form.date &&
    !!form.country &&
    !!form.channel &&
    !Number.isNaN(Number(form.followers)) &&
    Number(form.followers) >= 0;


  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Users className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Followers</h1>
            <p className="text-sm text-muted-foreground">
              Evolução mensal de seguidores por país e canal
            </p>
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setOpenBulk(true)}>
              <Upload className="mr-1 h-4 w-4" /> Import Massivo
            </Button>
            <Button onClick={() => setOpenDialog(true)}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar / Editar registro
            </Button>
          </div>
        )}
      </header>
      {canWrite && <FollowersBulkImportDialog open={openBulk} onOpenChange={setOpenBulk} />}

      {canWrite && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-[#FF0000]" />
            <h3 className="text-sm font-semibold">YouTube — entrada manual (inscritos ocultos)</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Pegue os 3 números no YouTube Studio (Configurações → os inscritos aparecem lá). O
            sistema distribui os demais países de LATAM automaticamente.
          </p>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Mês</Label>
              <Input
                type="month"
                value={ytForm.month}
                onChange={(e) => setYtForm((f) => ({ ...f, month: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Total LATAM (@auroratechsjlf)</Label>
              <Input
                type="number"
                min={0}
                value={ytForm.latam}
                onChange={(e) => setYtForm((f) => ({ ...f, latam: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Brasil (@auroratechatbf)</Label>
              <Input
                type="number"
                min={0}
                value={ytForm.brazil}
                onChange={(e) => setYtForm((f) => ({ ...f, brazil: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">US (@auroratechfyex129)</Label>
              <Input
                type="number"
                min={0}
                value={ytForm.us}
                onChange={(e) => setYtForm((f) => ({ ...f, us: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {ytMut.isSuccess && ytMut.data && (
                <span>
                  Diretos: <strong>{ytMut.data.diretos}</strong> · LATAM distribuídos:{" "}
                  <strong>{ytMut.data.latamDistribuidos}</strong> · Total regional:{" "}
                  <strong>{ytMut.data.totalRegional}</strong> · Diferença:{" "}
                  <strong>{ytMut.data.diferenca}</strong>
                  {ytMut.data.avisos.length > 0 && (
                    <span className="ml-2 text-amber-600">
                      Avisos: {ytMut.data.avisos.join("; ")}
                    </span>
                  )}
                </span>
              )}
              {ytMut.isError && (
                <span className="text-destructive">
                  {(ytMut.error as Error)?.message ?? "Erro desconhecido"}
                </span>
              )}
            </div>
            <Button
              type="button"
              disabled={!ytValid || ytMut.isPending}
              aria-busy={ytMut.isPending}
              onClick={() => {
                if (ytMut.isPending) return;
                ytMut.mutate();
              }}
            >
              {ytMut.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                "Salvar mês do YouTube"
              )}
            </Button>
          </div>
        </section>
      )}


      {/* Filters */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Início</Label>
            <Input
              type="date"
              value={filters.startDate ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, startDate: e.target.value || undefined }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fim</Label>
            <Input
              type="date"
              value={filters.endDate ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, endDate: e.target.value || undefined }))
              }
            />
          </div>
          <ChipMulti
            label="Ano Fiscal"
            options={(dims.data?.fys ?? []).map(String)}
            selected={filters.fys}
            onChange={(v) => setFilters((f) => ({ ...f, fys: v }))}
          />
          <div />
        </div>
        <ChipMulti
          label="Canal"
          options={dims.data?.channels ?? [...CHANNELS]}
          selected={filters.channels}
          onChange={(v) => setFilters((f) => ({ ...f, channels: v }))}
        />
        <ChipMulti
          label="País"
          options={dims.data?.countries ?? []}
          selected={filters.countries}
          onChange={(v) => setFilters((f) => ({ ...f, countries: v }))}
        />
      </div>

      {overview.isError && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Erro ao consultar BigQuery: {(overview.error as Error).message}</span>
        </div>
      )}

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {overview.isLoading || !overview.data ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))
        ) : (
          <>
            <KpiCard label="Total de Seguidores" value={overview.data.total} />
            {overview.data.perChannel.map((c) => {
              const meta = CHANNEL_META[c.channel] ?? { color: "#64748b", icon: Users };
              return (
                <KpiCard
                  key={c.channel}
                  label={c.channel}
                  value={c.total}
                  accentClass=""
                />
              );
            })}
          </>
        )}
      </section>

      {/* Charts */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <h3 className="mb-3 text-sm font-semibold">Seguidores por Canal ao longo do tempo</h3>
          {overview.isLoading ? (
            <div className="flex h-72 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={channelChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ym" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
                <RTooltip formatter={(v: any) => formatNumber(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {channelKeys.map((k) => (
                  <Bar key={k} dataKey={k} fill={CHANNEL_META[k]?.color ?? "#64748b"} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <h3 className="mb-3 text-sm font-semibold">Seguidores por País ao longo do tempo</h3>
          {overview.isLoading ? (
            <div className="flex h-72 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={countryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ym" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
                <RTooltip formatter={(v: any) => formatNumber(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {countryKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} fill={COUNTRY_PALETTE[i % COUNTRY_PALETTE.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Table */}
      <section className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-semibold">Registros</h3>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sortedTable.length}>
            <Download className="mr-1 h-4 w-4" /> Export Excel
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                {(
                  [
                    ["date", "Data"],
                    ["country", "País"],
                    ["channel", "Canal"],
                    ["followers", "Seguidores"],
                    ["fy", "Ano Fiscal"],
                  ] as const
                ).map(([k, label]) => (
                  <th
                    key={k}
                    className="cursor-pointer px-3 py-2 text-left font-medium"
                    onClick={() => onSort(k)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : sortedTable.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Nenhum registro encontrado
                  </td>
                </tr>
              ) : (
                sortedTable.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2 tabular-nums">{formatDatePtBR(r.date)}</td>
                    <td className="px-3 py-2">{r.country}</td>
                    <td className="px-3 py-2">{r.channel}</td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(r.followers)}</td>
                    <td className="px-3 py-2">{r.fy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Insert dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar registro de Followers</DialogTitle>
            <DialogDescription>
              A data será normalizada para o primeiro dia do mês selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">País</Label>
              <Select
                value={form.country}
                onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {(dims.data?.countries ?? []).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Canal</Label>
              <Select
                value={form.channel}
                onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Seguidores</Label>
              <Input
                type="number"
                min={0}
                value={form.followers}
                onChange={(e) => setForm((f) => ({ ...f, followers: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ano Fiscal</Label>
              <Input
                readOnly
                value={form.date ? calculateFY(`${form.date.slice(0, 7)}-01`) : ""}
                placeholder="Calculado a partir da data"
                className="bg-muted/40"
              />
            </div>
          </div>
          {insertMut.isError && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words font-medium">Falha ao gravar no BigQuery</span>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-background/60 p-2 text-[11px] text-foreground">
{(insertMut.error as Error)?.message ?? "Erro desconhecido"}
              </pre>
            </div>
          )}
          {insertMut.isSuccess && (insertMut.data as any)?.debug && (
            <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Sucesso — {(insertMut.data as any).affected} linha(s) gravada(s). Debug:
              </span>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-background/60 p-2 text-[11px] text-foreground">
{(insertMut.data as any).debug}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpenDialog(false)}
              disabled={insertMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!formValid || insertMut.isPending}
              aria-busy={insertMut.isPending}
              onClick={() => {
                if (insertMut.isPending) return;
                insertMut.mutate();
              }}
            >
              {insertMut.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
