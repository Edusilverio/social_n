import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2, Megaphone, Search, Users, FileBarChart, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/hub")({
  component: HubPage,
  head: () => ({ meta: [{ title: "Hub — Social Media Dashboard" }] }),
});

const MODULES = [
  { id: "social", title: "Social Media", desc: "Análise de redes sociais", icon: Share2, to: "/social", enabled: true, color: "from-primary to-primary-glow" },
  { id: "ads", title: "Ads", desc: "Google, Meta e LinkedIn Ads", icon: Megaphone, to: "/ads", enabled: false },
  { id: "seo", title: "SEO", desc: "Performance orgânica", icon: Search, to: "/seo", enabled: false },
  { id: "crm", title: "CRM", desc: "Funil de relacionamento", icon: Users, to: "#", enabled: false },
  { id: "reports", title: "Reports", desc: "Relatórios consolidados", icon: FileBarChart, to: "#", enabled: false },
] as const;

function HubPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Hub</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Selecione um módulo</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Acesse seus dashboards. Novos módulos aparecem aqui assim que forem disponibilizados.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const card = (
            <div
              className={cn(
                "group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-card transition-all",
                m.enabled
                  ? "hover:-translate-y-0.5 hover:shadow-elegant cursor-pointer"
                  : "opacity-60",
              )}
            >
              {m.enabled && (
                <div
                  aria-hidden
                  className="absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-30"
                  style={{ background: "var(--gradient-hero)" }}
                />
              )}
              <div className="relative flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl",
                    m.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                {!m.enabled && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Em breve
                  </span>
                )}
              </div>
              <h3 className="relative mt-5 text-lg font-semibold">{m.title}</h3>
              <p className="relative mt-1 text-sm text-muted-foreground">{m.desc}</p>
              {m.enabled && (
                <div className="relative mt-6 flex items-center gap-1 text-sm font-medium text-primary">
                  Abrir <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              )}
            </div>
          );
          return m.enabled ? (
            <Link key={m.id} to={m.to as any}>{card}</Link>
          ) : (
            <div key={m.id}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
