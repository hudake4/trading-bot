"use client";

import { Eye, Play, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { AccountResponse, BotRunDTO, BotStatusDTO } from "@/contracts/api";
import { getStrategy } from "@/domain/strategies";
import { api, errorMessage } from "@/lib/api-client";
import { fmtInstant } from "@/lib/dates";
import { bps, money, signedPct } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/field";
import { AnimatedBalance, Balance, Pnl } from "@/components/ui/money";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { EquityChart } from "./equity-chart";

export function DashboardView() {
  const account = useApi<AccountResponse>("account", api.getAccount);
  const bot = useApi<BotStatusDTO>("bot", api.getBotStatus);
  const settings = useApi("settings", api.getSettings);
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);

  const live = account.data ? account.data.connection.mode === "alpaca" && !account.data.connection.paper : false;
  const dryRun = settings.data?.dryRun ?? true;

  async function runNow() {
    setRunning(true);
    try {
      const run = await api.runBot();
      toast(runSummary(run), run.status === "ERROR" ? "error" : "success");
      await Promise.all([bot.reload(), account.reload()]);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRunning(false);
    }
  }

  async function toggleBot(enabled: boolean) {
    try {
      await api.patchSettings({ botEnabled: enabled });
      await Promise.all([bot.reload(), settings.reload()]);
      toast(enabled ? "Bot is on. It runs once each trading day while this app is open." : "Bot is off.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your account, what the bot is doing, and what you hold."
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              size="sm"
              loading={account.refreshing}
              onClick={() => void Promise.all([account.reload(), bot.reload()])}
              className="min-h-11 flex-1 sm:flex-none"
              data-testid="dashboard-refresh"
            >
              <RefreshCw className="size-4" aria-hidden="true" /> Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={running}
              onClick={() => (live && !dryRun ? setConfirmLive(true) : void runNow())}
              className="min-h-11 flex-1 sm:flex-none"
              data-testid="run-now"
            >
              <Play className="size-4" aria-hidden="true" /> {dryRun ? "Run now (dry run)" : "Run bot now"}
            </Button>
          </div>
        }
      />

      {account.error && <ErrorState message={account.error} onRetry={account.reload} title="Couldn't load your account" className="mb-6" />}

      {account.data ? (
        <div className="space-y-8" aria-busy={account.refreshing || undefined}>
          {bot.data?.liveBlocked && (
            <Alert role="alert" className="flex items-start gap-3 border-rose-200 bg-rose-50 p-4 text-rose-900" data-testid="live-blocked">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-700" aria-hidden="true" />
              <div>
                <AlertTitle className="font-bold">Orders are blocked on this live account</AlertTitle>
                <AlertDescription className="text-sm text-rose-900">
                  The bot only logs decisions until you confirm live trading.{" "}
                  <Link href="/settings" className="font-semibold underline">Open Settings</Link>
                </AlertDescription>
              </div>
            </Alert>
          )}

          <div className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
            <AccountCard data={account.data} />
            <BotCard bot={bot.data} activeStrategyId={settings.data?.activeStrategyId} positionBps={settings.data?.positionBps} stopLossBps={settings.data?.stopLossBps} onToggle={(v) => void toggleBot(v)} />
          </div>

          <Card>
            <CardHeader title="Equity, last 90 days" description="Account value at each close." />
            <CardBody>
              {account.data.equityHistory.length >= 2 ? (
                <EquityChart history={account.data.equityHistory} />
              ) : (
                <p className="text-sm text-slate-600">Equity history appears once the account has a few days of activity.</p>
              )}
            </CardBody>
          </Card>

          <PositionsCard positions={account.data.positions} />
        </div>
      ) : account.error ? null : (
        <DashboardSkeleton />
      )}

      <ConfirmDialog
        open={confirmLive}
        onClose={() => setConfirmLive(false)}
        title="Run the bot with real money?"
        description="This run places real orders on your live Alpaca account according to your strategies. Use a dry run if you only want to see what it would do."
        confirmLabel="Place real orders"
        onConfirm={async () => {
          setConfirmLive(false);
          await runNow();
        }}
      />
    </>
  );
}

const runSummary = (run: BotRunDTO) => {
  const orders = run.decisions.filter((d) => d.status === "SUBMITTED").length;
  const would = run.decisions.filter((d) => d.status === "DRY_RUN").length;
  if (run.status === "SKIPPED") return run.message ?? "Nothing to do.";
  if (run.status === "ERROR") return run.message ?? "The run finished with errors. See Activity.";
  if (run.dryRun) return would > 0 ? `Dry run: ${would} order${would === 1 ? "" : "s"} would be placed. See Activity.` : "Dry run: no orders needed.";
  return orders > 0 ? `${orders} order${orders === 1 ? "" : "s"} submitted.` : "Run finished: no orders needed.";
};

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <Card><CardBody className="space-y-4"><Skeleton className="h-5 w-48" /><Skeleton className="h-14 w-72" /><Skeleton className="h-4 w-64" /></CardBody></Card>
        <Card><CardBody className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</CardBody></Card>
      </div>
      <Card className="mt-6"><CardBody><Skeleton className="h-64 w-full" /></CardBody></Card>
    </LoadingRegion>
  );
}

function Metric({ label, sub, children, id }: { label: string; sub: ReactNode; children: ReactNode; id: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-3 sm:min-h-24 sm:grid-cols-1 sm:px-3" data-testid={`metric-${id}`}>
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xs leading-snug text-muted-foreground sm:order-3">{sub}</dd>
      <dd className="col-start-2 row-span-2 row-start-1 self-center font-semiwide text-right text-base font-bold tabular-nums text-foreground sm:col-start-1 sm:row-span-1 sm:row-start-auto sm:order-2 sm:mt-1 sm:text-left">{children}</dd>
    </div>
  );
}

function AccountCard({ data }: { data: AccountResponse }) {
  const { account, clock } = data;
  const dayChange = account.equityCents - account.lastEquityCents;
  const dayPct = account.lastEquityCents > 0 ? dayChange / account.lastEquityCents : 0;
  return (
    <section aria-labelledby="equity-heading" className="min-w-0">
      <Card data-testid="account-card">
        <CardBody className="p-5 sm:p-6">
          <h2 id="equity-heading" className="text-lg font-semibold text-foreground">Account equity</h2>
          <div className="font-semiwide mt-3 text-4xl leading-tight font-bold tracking-tight tabular-nums sm:text-[2.5rem]" data-testid="equity-value">
            <AnimatedBalance cents={account.equityCents} className="font-semiwide font-bold" />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <Pnl cents={dayChange} suffix={`(${signedPct(dayPct, 2)}) since the last close`} />
          </p>
          <dl className="mt-5 grid divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Metric id="cash" label="Cash" sub="Not invested">
              <Balance cents={account.cashCents} />
            </Metric>
            <Metric id="buying-power" label="Buying power" sub="Available for new orders">
              <Balance cents={account.buyingPowerCents} />
            </Metric>
            <Metric id="market" label="Market" sub={clock.isOpen ? "Regular session" : "Closed right now"}>
              <Badge tone={clock.isOpen ? "positive" : "neutral"}>{clock.isOpen ? "Open" : "Closed"}</Badge>
            </Metric>
          </dl>
          {account.blocked && (
            <p role="alert" className="mt-4 text-sm font-semibold text-rose-800">
              This account is blocked from trading.
            </p>
          )}
        </CardBody>
      </Card>
    </section>
  );
}

function BotCard({
  bot,
  activeStrategyId,
  positionBps,
  stopLossBps,
  onToggle,
}: {
  bot: BotStatusDTO | undefined;
  activeStrategyId: string | undefined;
  positionBps: number | undefined;
  stopLossBps: number | undefined;
  onToggle: (enabled: boolean) => void;
}) {
  const last = bot?.lastRun;
  return (
    <Card data-testid="bot-card">
      <CardHeader title="Trading bot" description="Runs once each trading day, shortly after the open, while this app is open." as="h2" />
      <CardBody className="space-y-5">
        {bot ? (
          <>
            <Switch
              checked={bot.enabled}
              onChange={onToggle}
              label={bot.enabled ? "Bot is on" : "Bot is off"}
              description={bot.dryRun ? "Dry run: it logs decisions without sending orders." : "Orders are on: it places real orders on this account."}
              testId="bot-switch"
            />
            <dl className="space-y-3 border-t border-border pt-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Default strategy</dt>
                <dd className="text-right font-semibold">
                  <Link href="/strategies" className="underline underline-offset-4" data-testid="bot-strategy">
                    {activeStrategyId ? getStrategy(activeStrategyId).name : "—"}
                  </Link>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Position size</dt>
                <dd className="font-semibold tabular-nums">{positionBps ? `${bps(positionBps)} of equity` : "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Stop-loss</dt>
                <dd className="font-semibold tabular-nums">{stopLossBps ? `${bps(stopLossBps)} below entry` : "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Last run</dt>
                <dd className="text-right font-semibold" data-testid="bot-last-run">
                  {last ? (
                    <Link href="/activity" className="underline underline-offset-4">
                      {fmtInstant(last.startedAt)} · {last.status === "OK" ? "OK" : last.status === "ERROR" ? "Errors" : last.status === "RUNNING" ? "Running" : "Skipped"}
                    </Link>
                  ) : (
                    "Never"
                  )}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        )}
      </CardBody>
    </Card>
  );
}

function PositionsCard({ positions }: { positions: AccountResponse["positions"] }) {
  if (positions.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="size-6" />}
        title="No open positions"
        description="When the bot buys, or you buy at Alpaca, your holdings appear here."
        testId="positions-empty"
        action={
          <Button asChild variant="secondary" size="sm" className="min-h-11">
            <Link href="/watchlist">
              <Eye className="size-4" aria-hidden="true" /> Open the watchlist
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <Card>
      <CardHeader title="Positions" description="Everything held in the account, including shares the bot didn't buy." />
      <div className="mt-4 overflow-x-auto" role="region" aria-label="Positions table" tabIndex={0}>
        <Table className="w-full min-w-[40rem] text-sm" data-testid="positions-table">
          <TableCaption className="sr-only">Open positions with cost, market value and unrealized profit or loss</TableCaption>
          <TableHeader className="bg-muted text-left text-xs text-muted-foreground">
            <TableRow>
              <TableHead scope="col" className="px-5">Symbol</TableHead>
              <TableHead scope="col" className="text-right">Shares</TableHead>
              <TableHead scope="col" className="text-right">Avg cost</TableHead>
              <TableHead scope="col" className="text-right">Price</TableHead>
              <TableHead scope="col" className="text-right">Market value</TableHead>
              <TableHead scope="col" className="pr-5 text-right">Unrealized P/L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((p) => (
              <TableRow key={p.symbol} data-testid={`position-${p.symbol}`}>
                <TableCell className="px-5 font-semiwide font-bold">{p.symbol}</TableCell>
                <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.avgEntryCents)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.currentPriceCents)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.marketValueCents)}</TableCell>
                <TableCell className="pr-5 text-right">
                  <Pnl cents={p.unrealizedPlCents} suffix={`(${signedPct(p.unrealizedPlPct)})`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
