import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Check, ChevronDown, Download, ListChecks, Loader2, X } from "lucide-react";
import * as XLSX from "xlsx";
import { getKpisReport, getKpisReportDimensions } from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const FY_OPTIONS = ["FY23", "FY24", "FY25", "FY26"] as const;

const CHANNEL_OPTIONS = [
  "LinkedIn",
  "Facebook",
  "Instagram Feed",
  "Instagram Story",
  "TikTok",
  "Twitter",
  "YouTube",
] as const;

const CHANNEL_BADGE: Record<string, string> = {
  Facebook: "bg-[#1877F2] text-white",
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

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatMonth(date: string): string {
  const [y, m] = date.split("-");
  const idx = Number(m) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > 11) return date;
  return `${MONTHS_PT[idx]}/${y}`;
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

function formatPct(v: number): string {
  const pct = Math.abs(v) > 1 ? v : v * 100;
  return `${pct.toFixed(2).replace(".", ",")}%`;
}

function engColor(v: number): string {
  const pct = Math.abs(v) > 1 ? v : v * 100;
  if (pct >= 10) return "text-emerald-600 font-semibold";
  if (pct >= 5) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

interface MultiDropdownProps {
  label: string;
  options: readonly string[];
  selected: string[]; // empty = all
  onChange: (next: string[]) => void;
  allLabel?: string;
  placeholder?: string;
}

function MultiDropdown({
  label,
  options,
  selected,
  onChange,
  allLabel = "Todos",
  placeholder = "Selecionar…",
}: MultiDropdownProps) {
  const isAll = selected.length === 0;
  const triggerLabel = isAll
    ? allLabel
    : selected.length === 1
    ? selected[0]
    : `${selected.length} selecionados`;

  const toggle = (opt: string) => {
    const set = new Set(selected);
    if (set.has(opt)) set.delete(opt);
    else set.add(opt);
    const next = Array.from(set);
    // If user selects every option, treat as "all" (empty = all).
    onChange(next.length === options.length ? [] : next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 w-full justify-between font-normal">
            <span className="truncate">{options.length === 0 ? placeholder : triggerLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
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
            {options.map((opt) => {
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
            {options.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                Nenhum item disponível
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function KpisReportPage() {
  const fetchDims = useServerFn(getKpisReportDimensions);
  const fetchReport = useServerFn(getKpisReport);

  const dims = useQuery({
    queryKey: ["kpis-report-dims"],
    queryFn: () => fetchDims({ data: undefined as never }),
    staleTime: 60 * 60 * 1000,
  });

  const [fy, setFy] = useState<string | null>(null);
  const [countries, setCountries] = useState<string[]>([]); // [] = todos
  const [channels, setChannels] = useState<string[]>([]); // [] = todos
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    if (fy == null && dims.data?.latestFy) setFy(dims.data.latestFy);
  }, [dims.data, fy]);

  const fyOptions = useMemo(() => {
    const fromDb = dims.data?.fys ?? [];
    return Array.from(new Set([...FY_OPTIONS, ...fromDb])).sort();
  }, [dims.data]);

  const hasRange = !!(startDate && endDate);

  const report = useQuery({
    queryKey: ["kpis-report", fy, countries, channels, startDate, endDate, hasRange],
    queryFn: () =>
      fetchReport({
        data: {
          fy: hasRange ? undefined : fy ?? undefined,
          countries: countries.length ? countries : undefined,
          channels: channels.length ? channels : undefined,
          startDate: hasRange ? startDate : undefined,
          endDate: hasRange ? endDate : undefined,
        },
      }),
    enabled: !!fy || hasRange,
    staleTime: 5 * 60 * 1000,
  });

  const rows = report.data?.rows ?? [];

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        País: r.country,
        Rede: r.channel,
        Mês: formatMonth(r.date),
        Followers: r.channel === "Instagram Story" ? "" : r.followers ?? 0,
        Posts: r.posts,
        Impressions: r.impressions,
        Alcance: r.reach,
        Engajamento: r.engagement,
        "Eng%": formatPct(r.engRate),
        "Ano Fiscal": r.fy,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KPIs Report");
    const suffix = hasRange ? `${startDate}_${endDate}` : fy ?? "all";
    XLSX.writeFile(wb, `kpis-report-${suffix}.xlsx`, { bookType: "xlsx" });
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ListChecks className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Report de KPIs</h1>
            <p className="text-sm text-muted-foreground">
              KPIs consolidados por país, canal e mês com followers do período
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={exportXlsx} disabled={!rows.length}>
          <Download className="mr-1 h-4 w-4" /> Exportar Excel
        </Button>
      </header>

      {/* Filters */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="space-y-1.5">
          <Label className="text-xs">
            Ano Fiscal
            {hasRange && (
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                (ignorado — período de datas ativo)
              </span>
            )}
          </Label>
          <div className={cn("flex flex-wrap gap-1.5", hasRange && "opacity-50")}>
            {fyOptions.map((opt) => {
              const active = fy === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={hasRange}
                  onClick={() => setFy(opt)}
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

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fim</Label>
            <div className="flex items-center gap-1">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {hasRange && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  title="Limpar período"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <MultiDropdown
            label="País"
            options={dims.data?.countries ?? []}
            selected={countries}
            onChange={setCountries}
          />
          <MultiDropdown label="Rede Social" options={CHANNEL_OPTIONS} selected={channels} onChange={setChannels} />
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
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left font-medium">País</th>
                <th className="px-3 py-2 text-left font-medium">Rede</th>
                <th className="px-3 py-2 text-left font-medium">Mês</th>
                <th className="px-3 py-2 text-right font-medium">Followers</th>
                <th className="px-3 py-2 text-right font-medium">Posts</th>
                <th className="px-3 py-2 text-right font-medium">Impressions</th>
                <th className="px-3 py-2 text-right font-medium">Alcance</th>
                <th className="px-3 py-2 text-right font-medium">Engajamento</th>
                <th className="px-3 py-2 text-right font-medium">Eng%</th>
                <th className="px-3 py-2 text-left font-medium">Ano Fiscal</th>
              </tr>
            </thead>
            <tbody>
              {report.isLoading || (!fy && !hasRange) ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const badgeCls = CHANNEL_BADGE[r.channel] ?? "bg-slate-500 text-white";
                  return (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-border/50 hover:bg-muted/40",
                        i % 2 === 1 && "bg-muted/20",
                      )}
                    >
                      <td className="px-3 py-2">{r.country}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                            badgeCls,
                          )}
                        >
                          {r.channel}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatMonth(r.date)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.channel === "Instagram Story" || r.followers == null
                          ? ""
                          : formatInt(r.followers)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.posts)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.impressions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.reach)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.engagement)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", engColor(r.engRate))}>
                        {formatPct(r.engRate)}
                      </td>
                      <td className="px-3 py-2">{r.fy}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
