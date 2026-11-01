import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { bulkUpsertFollowers } from "@/lib/social.functions";

const CLIENT_BATCH_SIZE = 500;
function chunkRowsForLog<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CLIENT_BATCH_SIZE) out.push(rows.slice(i, i + CLIENT_BATCH_SIZE));
  return out;
}

const COUNTRIES = [
  "Argentina","Benelux","Brazil","Chile","Colombia","Ecuador","France","México",
  "Perú","Portugal","Spain","US","Uruguay",
];
const CHANNELS = ["Facebook","Instagram","Linkedin","Tiktok","Twitter","Youtube"];

function calculateFY(dateStr: string): string {
  // dateStr in YYYY-MM-DD
  const [y, m] = dateStr.split("-").map(Number);
  const fyYear = m >= 4 ? y : y - 1;
  return `FY${String(fyYear).slice(-2)}`;
}

type ParsedRow = {
  date: string;
  followers: number;
  country: string;
  channel: string;
  fy: string;
};
type RowError = { sheet: string; row: number; field: string; message: string };

function normalizeDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-01`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-01`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return null;
}

function findCaseInsensitive<T extends string>(list: readonly T[], v: string): T | null {
  const found = list.find((x) => x.toLowerCase() === v.toLowerCase());
  return found ?? null;
}

function validateRow(
  raw: { date: unknown; followers: unknown; country: unknown; channel: unknown },
  sheet: string,
  rowNum: number,
): { row: ParsedRow | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const date = normalizeDate(raw.date);
  if (!date) errors.push({ sheet, row: rowNum, field: "Date", message: "Data inválida (use YYYY-MM-DD)" });

  const rawFollowers = raw.followers;
  const followersRawN =
    typeof rawFollowers === "number"
      ? rawFollowers
      : Number(String(rawFollowers ?? "").replace(/\s/g, "").replace(",", "."));
  let followersN = NaN;
  if (Number.isFinite(followersRawN)) {
    followersN = Math.round(followersRawN);
    if (followersN < 0) {
      errors.push({ sheet, row: rowNum, field: "Followers", message: "Número >= 0 obrigatório" });
    }
  } else {
    errors.push({ sheet, row: rowNum, field: "Followers", message: "Número inválido" });
  }

  const countryRaw = String(raw.country ?? "").trim();
  const country = findCaseInsensitive(COUNTRIES, countryRaw);
  if (!country) errors.push({ sheet, row: rowNum, field: "Country", message: `País inválido: "${countryRaw}"` });

  const channelRaw = String(raw.channel ?? "").trim();
  const channel = findCaseInsensitive(CHANNELS, channelRaw);
  if (!channel) errors.push({ sheet, row: rowNum, field: "Channel", message: `Canal inválido: "${channelRaw}"` });

  if (errors.length) return { row: null, errors };
  return {
    row: { date: date!, followers: followersN, country: country!, channel: channel!, fy: calculateFY(date!) },
    errors: [],
  };
}


function parseVerticalSheet(ws: XLSX.WorkSheet, sheetName: string) {
  const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: null, raw: true });
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  raw.forEach((r, idx) => {
    // find keys case-insensitively
    const keys = Object.keys(r);
    const get = (name: string) => {
      const k = keys.find((x) => x.toLowerCase() === name.toLowerCase());
      return k ? r[k] : null;
    };
    const isEmpty = ["Date","Followers","Country","Channel"].every((n) => {
      const v = get(n);
      return v == null || v === "";
    });
    if (isEmpty) return;
    const { row, errors: e } = validateRow(
      { date: get("Date"), followers: get("Followers"), country: get("Country"), channel: get("Channel") },
      sheetName,
      idx + 2, // +2: header row + 1-based
    );
    if (row) rows.push(row);
    errors.push(...e);
  });
  return { rows, errors };
}

function parseHorizontalSheet(ws: XLSX.WorkSheet, sheetName: string) {
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  if (!aoa.length) return { rows, errors };

  // Find header row: the first row that contains "Date" (case-insensitive) at least once
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    if ((aoa[i] || []).some((c) => typeof c === "string" && c.trim().toLowerCase() === "date")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { rows, errors };

  const header = aoa[headerIdx].map((c) => (typeof c === "string" ? c.trim().toLowerCase() : c));

  // Find all block starts: positions where header[i] === "date"
  const blockStarts: number[] = [];
  header.forEach((c, i) => {
    if (c === "date") blockStarts.push(i);
  });

  for (const start of blockStarts) {
    // Determine column indices for the block: expect Date, Followers, Country, Channel, FY in the next 4
    const cols: Record<string, number> = {};
    for (let k = 0; k < 5 && start + k < header.length; k++) {
      const h = header[start + k];
      if (typeof h === "string") cols[h] = start + k;
    }
    const dateCol = cols["date"];
    const followersCol = cols["followers"];
    const countryCol = cols["country"];
    const channelCol = cols["channel"];
    const fyCol = cols["fy"];
    if (dateCol == null || followersCol == null || countryCol == null || channelCol == null) continue;

    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const d = row[dateCol];
      const f = row[followersCol];
      const c = row[countryCol];
      const ch = row[channelCol];

      // Silently skip empty rows
      const allEmpty = [d, f, c, ch].every((v) => v == null || String(v).trim() === "");
      if (allEmpty) continue;

      // Silently skip invalid Country (empty, sheet name, or literal "Country")
      const countryStr = String(c ?? "").trim();
      if (
        !countryStr ||
        countryStr.toLowerCase() === sheetName.toLowerCase() ||
        countryStr.toLowerCase() === "country"
      ) {
        continue;
      }

      // Silently skip invalid Date
      if (!normalizeDate(d)) continue;

      const { row: parsed, errors: e } = validateRow(
        {
          date: d,
          followers: f,
          country: countryStr,
          channel: ch ?? sheetName,
        },
        sheetName,
        r + 1,
      );
      if (parsed) rows.push(parsed);
      errors.push(...e);
    }
  }
  return { rows, errors };
}

function parseWorkbook(wb: XLSX.WorkBook) {
  const sheets = wb.SheetNames;
  const verticalName = sheets.find((s) => s.toLowerCase() === "followers");
  if (verticalName) {
    return parseVerticalSheet(wb.Sheets[verticalName], verticalName);
  }
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const channelSheets = sheets.filter((s) => CHANNELS.some((c) => c.toLowerCase() === s.toLowerCase()));
  if (!channelSheets.length) {
    return {
      rows,
      errors: [{
        sheet: "-", row: 0, field: "-",
        message: "Nenhuma aba reconhecida. Use aba 'Followers' (formato simples) ou abas por rede (Facebook, Instagram, Linkedin, Tiktok, Twitter, Youtube).",
      }],
    };
  }
  for (const s of channelSheets) {
    const p = parseHorizontalSheet(wb.Sheets[s], s);
    rows.push(...p.rows);
    errors.push(...p.errors);
  }
  return { rows, errors };
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { Date: "2026-04-01", Followers: 172642, Country: "Brazil", Channel: "Facebook" },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Followers");
  // Aba de referência com valores aceitos
  const ref = XLSX.utils.aoa_to_sheet([
    ["Countries válidos", ...COUNTRIES],
    ["Channels válidos", ...CHANNELS],
    ["Date", "Primeiro dia do mês no formato YYYY-MM-DD"],
    ["Followers", "Número inteiro >= 0 (decimais são arredondados)"],
    ["FY", "Calculado automaticamente a partir da Date (ano fiscal japonês, início em Abril)"],
  ]);
  XLSX.utils.book_append_sheet(wb, ref, "Referência");
  XLSX.writeFile(wb, "Followers_Template.xlsx", { bookType: "xlsx" });
}

export function FollowersBulkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const upsertFn = useServerFn(bulkUpsertFollowers);

  const preview = useMemo(() => {
    if (!parsedRows.length) return null;
    return {
      total: parsedRows.length,
      channels: Array.from(new Set(parsedRows.map((r) => r.channel))).sort(),
      countries: Array.from(new Set(parsedRows.map((r) => r.country))).sort(),
    };
  }, [parsedRows]);

  const reset = () => {
    setFile(null);
    setParsedRows([]);
    setErrors([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setParsedRows([]);
    setErrors([]);
    setResult(null);
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const { rows, errors } = parseWorkbook(wb);
      setParsedRows(rows);
      setErrors(errors);
    } catch (e: any) {
      toast.error(`Erro ao ler arquivo: ${e?.message ?? "desconhecido"}`);
    } finally {
      setParsing(false);
    }
  };

  const importMut = useMutation({
    mutationFn: async () => {
      console.log(`[FollowersBulkImport] ${new Date().toISOString()} — enviando ${parsedRows.length} linhas`);
      chunkRowsForLog(parsedRows).forEach((batch, idx, batches) => {
        console.log(
          `[FollowersBulkImport] batch ${idx + 1}/${batches.length} (${batch.length} linhas) — payload:`,
          batch,
        );
      });
      return upsertFn({ data: { rows: parsedRows } });
    },
    onSuccess: (res: any) => {
      setResult({ inserted: res.inserted, updated: res.updated, total: res.total });
      toast.success(
        `Importação concluída: ${res.inserted} inseridos, ${res.updated} atualizados${errors.length ? `, ${errors.length} com erro` : ""}`,
      );
      console.log(`[FollowersBulkImport] ${new Date().toISOString()} — sucesso`, res);
      qc.invalidateQueries({ queryKey: ["followers-overview"] });
      qc.invalidateQueries({ queryKey: ["followers-dims"] });
    },
    onError: (e: any) => {
      console.error("[FollowersBulkImport] erro:", e);
      toast.error(e?.message?.split("\n")[0] ?? "Falha no import massivo", { duration: 8000 });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !importMut.isPending) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import massivo de Followers</DialogTitle>
          <DialogDescription>
            Envie uma planilha Excel (.xlsx). Cada linha faz UPSERT por (Data + País + Canal).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Formato: aba única <code>Followers</code> ou uma aba por rede.
            </span>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1 h-4 w-4" /> Baixar template
            </Button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition",
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            {file ? (
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium">Arraste o arquivo aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground">Somente .xlsx</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando planilha…
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {preview.total} linha(s) válida(s) prontas para upsert
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Canais: {preview.channels.join(", ")}</span>
                <span>Países: {preview.countries.length}</span>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="h-4 w-4" /> {errors.length} linha(s) com erro (serão ignoradas)
              </div>
              <div className="max-h-40 overflow-auto rounded bg-background/60 p-2">
                {errors.slice(0, 50).map((e, i) => (
                  <div key={i} className="text-[11px]">
                    [{e.sheet}] linha {e.row} · {e.field}: {e.message}
                  </div>
                ))}
                {errors.length > 50 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    … e mais {errors.length - 50}
                  </div>
                )}
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Concluído: {result.inserted} inseridos, {result.updated} atualizados, {errors.length} com erro
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importMut.isPending}>
            Fechar
          </Button>
          <Button
            disabled={!parsedRows.length || importMut.isPending || parsing}
            aria-busy={importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            {importMut.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processando…
              </>
            ) : (
              `Processar ${parsedRows.length || ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
