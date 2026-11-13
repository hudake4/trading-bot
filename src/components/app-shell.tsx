"use client";

import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ChartLine, FlaskConical, Eye, Layers, LayoutDashboard, ScrollText, Settings, TriangleAlert, Info } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { href: "/", label: "Dashboard", mobileLabel: "Home", icon: LayoutDashboard, testId: "nav-dashboard" },
  { href: "/strategies", label: "Strategies", mobileLabel: "Strategy", icon: Layers, testId: "nav-strategies" },
  { href: "/watchlist", label: "Watchlist", mobileLabel: "Watch", icon: Eye, testId: "nav-watchlist" },
  { href: "/analyze", label: "Analyze", mobileLabel: "Analyze", icon: ChartLine, testId: "nav-analyze" },
  { href: "/backtest", label: "Backtest", mobileLabel: "Test", icon: FlaskConical, testId: "nav-backtest" },
  { href: "/activity", label: "Activity", mobileLabel: "Activity", icon: ScrollText, testId: "nav-activity" },
  { href: "/settings", label: "Settings", mobileLabel: "Settings", icon: Settings, testId: "nav-settings" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Price steps rising across a ruled sheet. */
function DeskMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect width="28" height="28" rx="6" className="fill-slate-900" />
      <path d="M5 9.5h18M5 14h18M5 18.5h18" className="stroke-slate-600" strokeWidth="1" />
      <path d="M5 21l5-4 4 2 5-8 4-3" fill="none" className="stroke-highlight" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-control lg:min-h-0" aria-label="TradeDesk home">
      <DeskMark className="h-7 w-7" />
      <span className="font-semiwide text-[15px] font-bold tracking-tight text-slate-900">TradeDesk</span>
    </Link>
  );
}

/** Which account the app is acting on. Always visible, so demo, paper and live are never confused. */
export function ModeBadge({ className }: { className?: string }) {
  const settings = useApi("settings", api.getSettings);
  const c = settings.data?.connection;
  if (!c) return null;
  const [label, tone] = c.mode === "demo" ? (["Demo data", "warning"] as const) : c.paper ? (["Paper account", "info"] as const) : (["LIVE account", "negative"] as const);
  return (
    <Badge tone={tone} className={className} data-testid="mode-badge">
      {label}
    </Badge>
  );
}

function ConnectionBanner() {
  const settings = useApi("settings", api.getSettings);
  const c = settings.data?.connection;
  if (!c || (c.mode === "alpaca" && c.paper)) return null;

  if (c.mode === "demo") {
    return (
      <Alert role="status" className="mb-6 flex items-start gap-3 border-slate-300 bg-sheet p-4" data-testid="demo-banner">
        <Info className="mt-0.5 size-5 shrink-0 text-slate-600" aria-hidden="true" />
        <div>
          <AlertTitle className="font-bold text-slate-900">Demo data: not connected to Alpaca</AlertTitle>
          <AlertDescription className="text-sm text-slate-700">
            Prices are synthetic and the account is simulated in memory, so results say nothing about real markets. Add your Alpaca keys to <code>.env</code> and restart to connect (see Settings).
          </AlertDescription>
        </div>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive" role="alert" className="mb-6 flex items-start gap-3 border-rose-200 bg-rose-50 p-4" data-testid="live-banner">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-700" aria-hidden="true" />
      <div>
        <AlertTitle className="font-bold text-rose-900">Live account: orders use real money</AlertTitle>
        <AlertDescription className="text-sm text-rose-900">
          The bot places real orders only after you confirm live trading in Settings.
        </AlertDescription>
      </div>
    </Alert>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-control focus:bg-sheet focus:px-3 focus:py-2 focus:ring-1 focus:ring-slate-300"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-slate-100 lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex-1 px-3 py-3">
          <ul className="flex flex-col gap-0.5">
            {NAV.map(({ href, label, icon: Icon, testId }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    data-testid={testId}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors",
                      active ? "bg-sheet font-semibold text-slate-900 ring-1 ring-slate-200" : "font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900",
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-0.5 bg-brand-600" aria-hidden="true" />}
                    <Icon className={cn("h-4.5 w-4.5", active ? "text-brand-600" : "text-slate-500")} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mx-5 space-y-2 border-t border-slate-200 py-4">
          <ModeBadge />
          <p className="text-xs leading-relaxed text-slate-600">
            Runs on this computer. Your Alpaca keys stay in <code>.env</code> and are sent only to Alpaca.
          </p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
        <Logo />
        <ModeBadge />
      </header>

      <main id="main" className="overflow-x-clip pb-24 lg:pb-12 lg:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <ConnectionBanner />
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sheet pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-7">
          {NAV.map(({ href, label, mobileLabel, icon: Icon, testId }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  data-testid={`${testId}-mobile`}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-0 py-1 text-xs leading-3 font-medium tracking-tight",
                    active ? "text-brand-700" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand-600" aria-hidden="true" />}
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">{mobileLabel}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-[65ch] text-[15px] text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
