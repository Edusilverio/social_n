import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Linkedin, Facebook, Instagram, Music2, Twitter, Youtube, FileBarChart, Crown, ListChecks, UserPlus, ShieldCheck, Building2, ArrowRight, RefreshCw, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserRole } from "@/lib/social.functions";

export const Route = createFileRoute("/_authenticated/social/")({
  component: SocialIndex,
  head: () => ({ meta: [{ title: "Social — Redes" }] }),
});

const NETWORKS = [
  { to: "/social/linkedin", label: "LinkedIn", icon: Linkedin, color: "text-linkedin", enabled: true },
  { to: "/social/facebook", label: "Facebook", icon: Facebook, color: "text-facebook", enabled: true },
  { to: "/social/instagram", label: "Instagram", icon: Instagram, color: "text-instagram", enabled: true },
  { to: "/social/tiktok", label: "TikTok", icon: Music2, color: "text-tiktok", enabled: true },
  { to: "/social/twitter", label: "Twitter / X", icon: Twitter, color: "text-twitter", enabled: true },
  { to: "/social/youtube", label: "YouTube", icon: Youtube, color: "text-youtube", enabled: true },
] as const;

const VIEWS = [
  { to: "/social/report", label: "Report Consolidado", icon: FileBarChart },
  { to: "/social/ceo", label: "CEO View", icon: Crown },
  { to: "/social/kpis", label: "KPIs", icon: ListChecks },
  { to: "/social/followers", label: "Followers", icon: UserPlus },
  { to: "/social/auditoria", label: "Auditoria", icon: ShieldCheck },
  { to: "/social/foundation-face", label: "Foundation Facebook", icon: Building2 },
  { to: "/social/foundation-link", label: "Foundation LinkedIn", icon: Building2 },
] as const;


function SocialIndex() {
  const getUserRoleFn = useServerFn(getUserRole);
  const roleQuery = useQuery({
    queryKey: ["user-role"],
    queryFn: () => getUserRoleFn({ data: undefined }),
    staleTime: 5 * 60_000,
  });
  const canWrite = roleQuery.data?.canWrite === true;
  const canManageUsers = roleQuery.data?.canManageUsers === true;
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Módulo Social</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Redes sociais</h1>
        <p className="mt-2 text-muted-foreground">Selecione uma rede para ver KPIs, posts e engajamento.</p>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Plataformas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NETWORKS.map((n) => {
            const Icon = n.icon;
            const card = (
              <div
                className={cn(
                  "group relative flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-card transition-all",
                  n.enabled ? "hover:-translate-y-0.5 hover:shadow-elegant" : "opacity-60",
                )}
              >
                <Icon className={cn("h-9 w-9", n.color)} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.enabled ? "Dados ativos" : "Em breve"}
                  </p>
                </div>
                {n.enabled && <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />}
              </div>
            );
            return n.enabled ? <Link key={n.to} to={n.to as any}>{card}</Link> : <div key={n.to}>{card}</div>;
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Visões consolidadas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <Link
                key={v.to}
                to={v.to as any}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-card hover:border-primary/40 hover:shadow-elegant"
              >
                <Icon className="h-5 w-5 text-primary" />
                <span className="flex-1 text-sm font-medium">{v.label}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            );
          })}
        </div>
      </section>

      {(canWrite || canManageUsers) && (
        <section className="mt-12">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Administração</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {canWrite && (
              <Link
                to="/social/sincronizar"
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-card hover:border-primary/40 hover:shadow-elegant"
              >
                <RefreshCw className="h-5 w-5 text-primary" />
                <span className="flex-1 text-sm font-medium">Sincronizar dados</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            )}
            {canManageUsers && (
              <Link
                to="/social/usuarios"
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-card hover:border-primary/40 hover:shadow-elegant"
              >
                <UserCog className="h-5 w-5 text-primary" />
                <span className="flex-1 text-sm font-medium">Gestão de usuários</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
