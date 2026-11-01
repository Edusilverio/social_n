import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Crown, Download, Loader2, X } from "lucide-react";
import * as XLSX from "xlsx";
import { getCeoReport } from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDateRangeFromMaxDate } from "@/hooks/useDateRangeFromMaxDate";

const MES_ABREV: Record<number, string> = {
  1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez",
};

const GROUPS = ["Countrys", "Latam", "Benelux"] as const;
type Group = (typeof GROUPS)[number];

interface Row {
  ano: number;
  mes: number;
  mesNome: string;
  pais: string;
  impressions: number;
  rede: string;
  grupo: string;
}

function firstOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfMonth(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

function sortRows(rows: Row[]): Row[] {
  return [...rows].sort(
    (a, b) =>
      a.ano - b.ano ||
      a.mes - b.mes ||
      a.pais.localeCompare(b.pais) ||
      a.rede.localeCompare(b.rede),
  );
}

export function CeoViewPage() {
  const fetchReport = useServerFn(getCeoReport);

  const { range, setRange, reset: resetRange } = useDateRangeFromMaxDate();
  const startDate = range.startDate;
  const endDate = range.endDate;
  const setStartDate = (v: string) => setRange((r) => ({ ...r, startDate: v }));
  const setEndDate = (v: string) => setRange((r) => ({ ...r, endDate: v }));

  const report = useQuery({
    queryKey: ["ceo-report", startDate, endDate],
    queryFn: () => fetchReport({ data: { startDate, endDate } }),
    enabled: !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000,
  });

  const rows = report.data?.rows ?? [];

  const grouped = useMemo(() => {
    const map: Record<Group, Row[]> = { Countrys: [], Latam: [], Benelux: [] };
    for (const r of rows) {
      if ((GROUPS as readonly string[]).includes(r.grupo)) {
        map[r.grupo as Group].push(r);
      }
    }
    for (const g of GROUPS) map[g] = sortRows(map[g]);
    return map;
  }, [rows]);

  const fileName = useMemo(() => {
    // Use end date for naming (último mês do período)
    const [y, m] = endDate.split("-").map(Number);
    const abbr = MES_ABREV[m] ?? "";
    const yy = String(y).slice(-2);
    return `CEO Report ${abbr}.${yy}.xlsx`;
  }, [endDate]);

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    for (const g of GROUPS) {
      const data = grouped[g].map((r) => ({
        Ano: r.ano,
        Mês: r.mesNome || (MES_ABREV[r.mes] ?? ""),
        Pais: r.pais,
        Impressions: r.impressions,
        Rede: r.rede,
      }));
      const ws = XLSX.utils.json_to_sheet(data, {
        header: ["Ano", "Mês", "Pais", "Impressions", "Rede"],
      });
      XLSX.utils.book_append_sheet(wb, ws, g);
    }
    XLSX.writeFile(wb, fileName, { bookType: "xlsx" });
  };

  const clearDates = () => {
    resetRange();
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Crown className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">CEO View</h1>
            <p className="text-sm text-muted-foreground">
              Relatório executivo de impressões por país e rede
            </p>
          </div>
        </div>
        <Button onClick={exportXlsx} disabled={!rows.length}>
          <Download className="mr-1 h-4 w-4" /> Exportar Excel
        </Button>
      </header>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Data início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data fim</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={clearDates}>
              <X className="mr-1 h-3.5 w-3.5" /> Resetar para mês atual
            </Button>
          </div>
        </div>
      </div>

      {report.isError && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Erro ao consultar BigQuery: {(report.error as Error).message}</span>
        </div>
      )}

      {report.isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        GROUPS.map((g) => (
          <section key={g} className="rounded-xl border border-border bg-card shadow-card">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider">{g}</h2>
              <span className="text-xs text-muted-foreground">
                {grouped[g].length} registro{grouped[g].length === 1 ? "" : "s"}
              </span>
            </header>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Ano</th>
                    <th className="px-3 py-2 text-left font-medium">Mês</th>
                    <th className="px-3 py-2 text-left font-medium">País</th>
                    <th className="px-3 py-2 text-left font-medium">Rede</th>
                    <th className="px-3 py-2 text-right font-medium">Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[g].length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        Nenhum registro encontrado.
                      </td>
                    </tr>
                  ) : (
                    grouped[g].map((r, i) => (
                      <tr
                        key={`${g}-${i}`}
                        className={cn(
                          "border-b border-border/50 hover:bg-muted/40",
                          i % 2 === 1 && "bg-muted/20",
                        )}
                      >
                        <td className="px-3 py-2 tabular-nums">{r.ano}</td>
                        <td className="px-3 py-2 capitalize">{r.mesNome || MES_ABREV[r.mes] || ""}</td>
                        <td className="px-3 py-2">{r.pais}</td>
                        <td className="px-3 py-2">{r.rede}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.impressions)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
