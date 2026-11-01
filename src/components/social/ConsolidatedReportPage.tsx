import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileBarChart,
  Loader2,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  getConsolidatedDimensions,
  getConsolidatedReport,
} from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KpiCard } from "@/components/social/KpiCard";
import { cn } from "@/lib/utils";
import { formatDatePtBR } from "@/lib/format-date";
import { useDateRangeFromMaxDate } from "@/hooks/useDateRangeFromMaxDate";

const REDE_OPTIONS = [
  "Facebook",
  "Instagram",
  "Instagram Story",
  "LinkedIn",
  "TikTok",
  "Twitter",
  "YouTube",
] as const;

const REDE_BADGE: Record<string, string> = {
  Facebook: "bg-[#1877F2] text-white",
  Instagram: "bg-[#8B5CF6] text-white",
  "Instagram Feed": "bg-[#8B5CF6] text-white",
  "Instagram Story": "bg-[#EC4899] text-white",
  Linkedin: "bg-[#0A4A7A] text-white",
  LinkedIn: "bg-[#0A4A7A] text-white",
  Tiktok: "bg-black text-white",
  TikTok: "bg-black text-white",
  Twitter: "bg-[#52606D] text-white",
  "Twitter/X": "bg-[#52606D] text-white",
  X: "bg-[#52606D] text-white",
  Youtube: "bg-[#FF0000] text-white",
  YouTube: "bg-[#FF0000] text-white",
};

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

function formatPct(v: number): string {
  const pct = Math.abs(v) > 1 ? v : v * 100;
  return `${pct.toFixed(2).replace(".", ",")}%`;
}

function formatDate(iso: string): string {
  return formatDatePtBR(iso);
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(first), end: iso(last) };
}

interface MultiDropdownProps {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
}

function MultiDropdown({
  label,
  options,
  selected,
  onChange,
  allLabel = "Todos",
}: MultiDropdownProps) {
  const [query, setQuery] = useState("");
  const isAll = selected.length === 0;
  const triggerLabel = isAll
    ? allLabel
    : selected.length === 1
    ? selected[0]
    : `${selected.length} selecionados`;

  const filtered = useMemo(
    () =>
      query.trim()
        ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
        : options,
    [options, query],
  );

  const toggle = (opt: string) => {
    const set = new Set(selected);
    if (set.has(opt)) set.delete(opt);
    else set.add(opt);
    const next = Array.from(set);
    onChange(next.length === options.length ? [] : next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 w-full justify-between font-normal">
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="border-b border-border p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center justify-between border-b border-border p-2 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => onChange([])}>
              {allLabel}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={() => onChange([...options])}
            >
              Marcar tudo
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.map((opt) => {
              const checked = isAll || selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(opt)} />
                  <span className="truncate">{opt}</span>
                  {checked && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                Nenhum item
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type SortKey =
  | "titulo"
  | "rede"
  | "tipo"
  | "data"
  | "impressions"
  | "reach"
  | "interactions"
  | "engRate";

export function ConsolidatedReportPage() {
  const fetchDims = useServerFn(getConsolidatedDimensions);
  const fetchReport = useServerFn(getConsolidatedReport);

  const { range, setRange } = useDateRangeFromMaxDate();
  const startDate = range.startDate;
  const endDate = range.endDate;
  const setStartDate = (v: string) => setRange((r) => ({ ...r, startDate: v }));
  const setEndDate = (v: string) => setRange((r) => ({ ...r, endDate: v }));
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [redes, setRedes] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const dims = useQuery({
    queryKey: ["consolidated-dims"],
    queryFn: () => fetchDims({ data: undefined as never }),
    staleTime: 60 * 60 * 1000,
  });

  const report = useQuery({
    queryKey: ["consolidated", startDate, endDate, hashtags, redes, tipos, buscaDebounced],
    queryFn: () =>
      fetchReport({
        data: {
          startDate,
          endDate,
          hashtags: hashtags.length ? hashtags : undefined,
          redes: redes.length ? redes : undefined,
          tipos: tipos.length ? tipos : undefined,
          busca: buscaDebounced || undefined,
        },
      }),
    enabled: !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000,
  });

  const rows = report.data?.rows ?? [];
  const kpis = report.data?.kpis;

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const mul = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv), "pt-BR") * mul;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, hashtags, redes, tipos, buscaDebounced, pageSize, sortKey, sortDir]);

  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "titulo" || k === "rede" || k === "tipo" ? "asc" : "desc");
    }
  };

  const SortHeader = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        className={cn(
          "select-none px-3 py-2 font-medium",
          align === "right" ? "text-right" : "text-left",
        )}
      >
        <button
          type="button"
          onClick={() => onSort(k)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground",
            active && "text-foreground",
          )}
        >
          {label}
          <Icon className="h-3 w-3 opacity-60" />
        </button>
      </th>
    );
  };

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(
      sortedRows.map((r) => ({
        Título: r.titulo,
        Rede: r.rede,
        Tipo: r.tipo,
        Data: formatDate(r.data),
        Link: r.link,
        Impressões: r.impressions,
        Alcance: r.reach,
        Interações: r.interactions,
        "Eng %": formatPct(r.engRate),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report Consolidado");
    XLSX.writeFile(wb, `report-consolidado-${startDate}_${endDate}.xlsx`, { bookType: "xlsx" });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <FileBarChart className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Report Consolidado</h1>
              <p className="text-sm text-muted-foreground">
                Publicações de todas as redes em uma única visão
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={exportXlsx} disabled={!sortedRows.length}>
            <Download className="mr-1 h-4 w-4" /> Exportar Excel
          </Button>
        </header>

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Posts" value={kpis?.posts ?? 0} />
          <KpiCard label="Impressões" value={kpis?.impressions ?? 0} />
          <KpiCard label="Alcance" value={kpis?.reach ?? 0} />
          <KpiCard label="Interações" value={kpis?.interactions ?? 0} />
          <KpiCard label="Engajamento" value={kpis?.engRate ?? 0} format="percent" />
        </div>

        {/* Filters */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <MultiDropdown
              label="Hashtag"
              options={dims.data?.hashtags ?? []}
              selected={hashtags}
              onChange={setHashtags}
            />
            <MultiDropdown label="Rede" options={REDE_OPTIONS} selected={redes} onChange={setRedes} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <MultiDropdown
              label="Tipo de Post"
              options={dims.data?.tipos ?? []}
              selected={tipos}
              onChange={setTipos}
            />
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs">Buscar no título</Label>
              <div className="relative">
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Digite parte do título…"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {report.isError && (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Erro ao consultar BigQuery: {(report.error as Error).message}</span>
          </div>
        )}

        {/* Table */}
        <section className="rounded-xl border border-border bg-card shadow-card">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground backdrop-blur">
                <tr>
                  <SortHeader k="titulo" label="Título" />
                  <SortHeader k="rede" label="Rede" />
                  <SortHeader k="tipo" label="Tipo" />
                  <SortHeader k="data" label="Data" />
                  <th className="px-3 py-2 text-center font-medium">Link</th>
                  <SortHeader k="impressions" label="Impressões" align="right" />
                  <SortHeader k="reach" label="Alcance" align="right" />
                  <SortHeader k="interactions" label="Interações" align="right" />
                  <SortHeader k="engRate" label="Eng %" align="right" />
                </tr>
              </thead>
              <tbody>
                {report.isLoading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Nenhuma publicação encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r, i) => {
                    const badge = REDE_BADGE[r.rede] ?? "bg-slate-500 text-white";
                    return (
                      <tr
                        key={i}
                        className={cn(
                          "border-b border-border/50 hover:bg-muted/40",
                          i % 2 === 1 && "bg-muted/20",
                        )}
                      >
                        <td className="max-w-[380px] px-3 py-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate cursor-help">{r.titulo || "—"}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md whitespace-pre-wrap text-xs">
                              {r.titulo || "—"}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                              badge,
                            )}
                          >
                            {r.rede}
                          </span>
                        </td>
                        <td className="px-3 py-2">{r.tipo || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{formatDate(r.data)}</td>
                        <td className="px-3 py-2 text-center">
                          {r.link ? (
                            <a
                              href={r.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-primary"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.impressions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.reach)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.interactions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPct(r.engRate)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
            <div className="text-muted-foreground">
              {sortedRows.length === 0
                ? "0 registros"
                : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, sortedRows.length)} de ${sortedRows.length}`}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Por página</Label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 tabular-nums text-xs text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}
