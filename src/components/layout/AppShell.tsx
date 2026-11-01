import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Home,
  Share2,
  Megaphone,
  Search,
  ChevronLeft,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/hub", label: "Hub", icon: Home, enabled: true },
  { to: "/social", label: "Social", icon: Share2, enabled: true },
  { to: "/ads", label: "Ads", icon: Megaphone, enabled: false },
  { to: "/seo", label: "SEO", icon: Search, enabled: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "sticky top-0 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BarChart3 className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Social Dashboard</p>
              <p className="truncate text-xs text-sidebar-foreground/60">v1.5</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => {
            const active = path === item.to || path.startsWith(item.to + "/");
            const Icon = item.icon;
            const content = (
              <>
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex-1 text-sm">{item.label}</span>
                )}
                {!collapsed && !item.enabled && (
                  <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase">
                    Em breve
                  </span>
                )}
              </>
            );
            const cls = cn(
              "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              !item.enabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
            );
            if (!item.enabled)
              return (
                <div key={item.to} className={cls}>
                  {content}
                </div>
              );
            return (
              <Link key={item.to} to={item.to} className={cls}>
                {content}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
          <Breadcrumb path={path} />
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
              <UserIcon className="h-4 w-4" />
              <span className="max-w-[200px] truncate">{user?.email}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function Breadcrumb({ path }: { path: string }) {
  const labels: Record<string, string> = {
    hub: "Hub",
    social: "Social",
    linkedin: "LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    twitter: "Twitter / X",
    youtube: "YouTube",
    report: "Report",
    ceo: "CEO View",
    kpis: "KPIs",
    followers: "Followers",
    auditoria: "Auditoria",
    "foundation-face": "Foundation Facebook",
    "foundation-link": "Foundation LinkedIn",
    ads: "Ads",
    seo: "SEO",
  };
  const parts = path.split("/").filter(Boolean);
  return (
    <nav className="flex items-center gap-2 text-sm">
      {parts.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground">/</span>}
          <span className={i === parts.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}>
            {labels[p] ?? p}
          </span>
        </div>
      ))}
    </nav>
  );
}
