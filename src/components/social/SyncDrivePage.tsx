import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, CloudDownload, Loader2, RefreshCw, XCircle } from "lucide-react";
import {
  getUserRole,
  syncDrive,
  type DriveSyncReportItem,
  type DriveSyncResult,
} from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_META: Record<
  string,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  concluido: {
    label: "Concluído",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  ignorado: {
    label: "Já processado",
    className: "bg-muted text-muted-foreground border-border",
    icon: RefreshCw,
  },
  bloqueado: {
    label: "Bloqueado",
    className: "bg-amber-100 text-amber-900 border-amber-300",
    icon: AlertTriangle,
  },
  erro: {
    label: "Erro",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status?: string }) {
  const meta = STATUS_META[status ?? ""] ?? STATUS_META.erro;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export function SyncDrivePage() {
  const queryClient = useQueryClient();
  const getUserRoleFn = useServerFn(getUserRole);
  const syncDriveFn = useServerFn(syncDrive);

  const roleQuery = useQuery({
    queryKey: ["user-role"],
    queryFn: () => getUserRoleFn({ data: undefined }),
    staleTime: 5 * 60_000,
  });

  const [result, setResult] = useState<DriveSyncResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => syncDriveFn({ data: {} }),
    onSuccess: (data) => {
      setResult(data);
      const relatorio = data.relatorio ?? [];
      toast.success(`Sincronização: ${relatorio.length} arquivo(s) processado(s)`);
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Falha ao sincronizar com o Drive.");
    },
  });

  const canWrite = roleQuery.data?.canWrite === true;

  if (roleQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-muted-foreground">
          Somente usuários com papel <strong>root</strong> ou <strong>editor</strong> podem sincronizar dados.
        </p>
      </div>
    );
  }

  const relatorio = result?.relatorio ?? [];
  const error = result?.erro;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Administração</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sincronizar dados</h1>
        <p className="mt-2 text-muted-foreground">
          Sincroniza <strong>posts</strong> a partir do Google Drive. Arquivos já importados são ignorados automaticamente.
        </p>
      </header>

      <div className="mb-8 flex items-center gap-3 rounded-lg border border-border bg-card p-5 shadow-card">
        <CloudDownload className="h-8 w-8 text-primary" />
        <div className="flex-1">
          <p className="font-medium">Google Drive → Banco de dados</p>
          <p className="text-sm text-muted-foreground">
            A sincronização pode levar alguns segundos por arquivo.
          </p>
        </div>
        <Button size="lg" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sincronizar com o Drive
            </>
          )}
        </Button>
      </div>

      {mutation.isError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Falha ao sincronizar</p>
              <p className="mt-1">{(mutation.error as Error)?.message}</p>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Posts</h2>
            <PostsReportTable relatorio={relatorio} />
          </section>
        </div>
      )}
    </div>
  );
}

function PostsReportTable({ relatorio }: { relatorio: DriveSyncReportItem[] }) {
  const summary = useMemo(() => {
    const s = { concluido: 0, ignorado: 0, bloqueado: 0, erro: 0 };
    for (const r of relatorio) {
      const k = (r.status ?? "erro") as keyof typeof s;
      if (k in s) s[k]++;
    }
    return s;
  }, [relatorio]);

  if (!relatorio.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Nenhum arquivo processado.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-sm">
        <span className="font-medium">Relatório</span>
        <span className="text-muted-foreground">
          {relatorio.length} arquivo(s) — {summary.concluido} concluído(s) · {summary.ignorado} ignorado(s) ·{" "}
          {summary.bloqueado} bloqueado(s) · {summary.erro} erro(s)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Arquivo</th>
              <th className="px-4 py-2 font-medium">Rede</th>
              <th className="px-4 py-2 font-medium">Período</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Linhas gravadas</th>
              <th className="px-4 py-2 font-medium">Observação</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.map((r, i) => {
              const bloqueado = r.status === "bloqueado";
              return (
                <tr
                  key={i}
                  className={cn(
                    "border-t border-border align-top",
                    bloqueado && "bg-amber-50/50",
                    r.status === "erro" && "bg-red-50/40",
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs">{r.arquivo ?? "—"}</td>
                  <td className="px-4 py-3">{r.rede ?? "—"}</td>
                  <td className="px-4 py-3">{r.periodo ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.status === "concluido" ? (r.linhas_gravadas ?? 0).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {bloqueado && r.colunas?.length ? (
                      <div className="text-amber-900">
                        <p className="font-medium">Coluna(s) nova(s) detectada(s): {r.colunas.join(", ")}</p>
                        <p className="mt-0.5 text-amber-800/80">
                          Precisam ser mapeadas antes de importar.
                        </p>
                      </div>
                    ) : r.status === "erro" ? (
                      <span className="text-red-700">{r.erro ?? r.mensagem ?? "Erro desconhecido"}</span>
                    ) : r.status === "ignorado" ? (
                      <span className="text-muted-foreground">Já processado</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {r.mensagem ??
                          (typeof r.linhas_descartadas === "number"
                            ? `${r.linhas_descartadas} descartada(s)`
                            : "—")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
