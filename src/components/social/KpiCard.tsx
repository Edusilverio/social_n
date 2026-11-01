import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number; // percent change
  format?: "number" | "percent";
  accentClass?: string;
}

function formatValue(value: string | number, format: "number" | "percent") {
  if (typeof value === "string") return value;
  if (format === "percent") return `${(value * 100).toFixed(2)}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("pt-BR");
}

function fullValue(value: string | number, format: "number" | "percent") {
  if (typeof value === "string") return value;
  if (format === "percent") return `${(value * 100).toFixed(4)}%`;
  return value.toLocaleString("pt-BR");
}

export function KpiCard({ label, value, delta, format = "number", accentClass }: KpiCardProps) {
  const Icon = delta == null ? null : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const deltaColor = delta == null ? "" : delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-card">
      <div className={cn("absolute inset-x-0 top-0 h-1", accentClass ?? "bg-primary")} />
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="mt-2 inline-block cursor-help text-2xl font-semibold tabular-nums">
              {formatValue(value, format)}
            </p>
          </TooltipTrigger>
          <TooltipContent side="top" className="font-mono text-sm tabular-nums">
            {fullValue(value, format)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {delta != null && Icon && (
        <p className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium", deltaColor)}>
          <Icon className="h-3 w-3" />
          {Math.abs(delta * 100).toFixed(1)}% vs mês anterior
        </p>
      )}
    </div>
  );
}

