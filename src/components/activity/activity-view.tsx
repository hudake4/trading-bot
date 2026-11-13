"use client";

import { ChevronDown, ChevronUp, Play, ScrollText } from "lucide-react";
import { useState } from "react";
import type { ActivityResponse, BotDecisionDTO, BotRunDTO } from "@/contracts/api";
import { getStrategy } from "@/domain/strategies";
import { api, errorMessage } from "@/lib/api-client";
import { fmtInstant } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { ActionBadge } from "@/components/watchlist/watchlist-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

export function ActivityView() {
  const activity = useApi<ActivityResponse>("activity", api.getActivity);
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  async function dryRun() {
    setRunning(true);
    try {
      const run = await api.runBot(true);
      await activity.reload();
      setOpen((o) => new Set(o).add(run.id));
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRunning(false);
    }
  }

  const runs = activity.data?.runs ?? [];
  // The newest run starts expanded; everything else stays collapsed until opened.
  const isOpen = (run: BotRunDTO) => (open.has(run.id) ? !open.has(`-${run.id}`) : run.id === runs[0]?.id && !open.has(`-${run.id}`));
  const toggle = (run: BotRunDTO) =>
    setOpen((o) => {
      const n = new Set(o);
      if (isOpen(run)) {
        n.delete(run.id);
        n.add(`-${run.id}`);
      } else {
        n.delete(`-${run.id}`);
        n.add(run.id);
      }
      return n;
    });

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every bot run and what it decided for each symbol, including why it skipped one."
        actions={
          runs.length > 0 ? (
            <Button size="sm" loading={running} onClick={() => void dryRun()} className="min-h-11" data-testid="activity-dry-run">
              <Play className="size-4" aria-hidden="true" /> Dry run now
            </Button>
          ) : undefined
        }
      />
      {activity.error && <ErrorState message={activity.error} onRetry={activity.reload} className="mb-6" />}
      {activity.data && runs.length === 0 && (
        <EmptyState
          icon={<ScrollText className="size-6" />}
          title="The bot hasn't run yet"
          description="A dry run shows what the bot would do right now without placing any orders."
          testId="activity-empty"
          action={
            <Button variant="primary" loading={running} onClick={() => void dryRun()} className="min-h-11" data-testid="activity-empty-run">
              <Play className="size-4" aria-hidden="true" /> Dry run now
            </Button>
          }
        />
      )}
      {runs.length > 0 && (
        <ul className="space-y-4" data-testid="run-list">
          {runs.map((run) => (
            <li key={run.id}>
              <RunCard run={run} expanded={isOpen(run)} onToggle={() => toggle(run)} />
            </li>
          ))}
        </ul>
      )}
      {!activity.data && !activity.error && (
        <LoadingRegion label="Loading activity">
          <Card><CardBody className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardBody></Card>
        </LoadingRegion>
      )}
    </>
  );
}

const STATUS_TONE = { OK: "positive", ERROR: "negative", SKIPPED: "neutral", RUNNING: "info" } as const;
const STATUS_LABEL = { OK: "Finished", ERROR: "Errors", SKIPPED: "Skipped", RUNNING: "Running" } as const;

function RunCard({ run, expanded, onToggle }: { run: BotRunDTO; expanded: boolean; onToggle: () => void }) {
  const placed = run.decisions.filter((d) => d.status === "SUBMITTED").length;
  const would = run.decisions.filter((d) => d.status === "DRY_RUN").length;
  const headingId = `run-${run.id}`;
  return (
    <Card data-testid="run-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${headingId}-body`}
        className="flex min-h-11 w-full flex-wrap items-center justify-between gap-3 rounded-sheet px-5 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span id={headingId} className="font-semiwide text-base font-bold text-foreground">{fmtInstant(run.startedAt)}</span>
          <Badge tone="neutral">{run.trigger === "SCHEDULED" ? "Scheduled" : "Manual"}</Badge>
          <Badge tone={run.dryRun ? "warning" : "info"}>{run.dryRun ? "Dry run" : "Orders on"}</Badge>
          <Badge tone={STATUS_TONE[run.status]}>{STATUS_LABEL[run.status]}</Badge>
        </span>
        <span className="flex items-center gap-3 text-sm text-slate-700">
          <span className="tabular-nums">
            {run.dryRun ? `${would} would trade` : `${placed} order${placed === 1 ? "" : "s"} placed`} · {run.decisions.length} symbol{run.decisions.length === 1 ? "" : "s"}
          </span>
          {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </span>
      </button>
      {expanded && (
        <div id={`${headingId}-body`} className="space-y-3 border-t border-border pb-4">
          {run.message && <p className="px-5 pt-3 text-sm text-slate-700" data-testid="run-message">{run.message}</p>}
          {run.equityCents !== null && <p className="px-5 text-xs text-muted-foreground">Account equity at the start: {money(run.equityCents)}</p>}
          {run.decisions.length > 0 && (
            <div className="overflow-x-auto" role="region" aria-label={`Decisions for the run at ${fmtInstant(run.startedAt)}`} tabIndex={0}>
              <Table className="w-full min-w-[44rem] text-sm">
                <TableCaption className="sr-only">Decisions per symbol</TableCaption>
                <TableHeader className="bg-muted text-left text-xs text-muted-foreground">
                  <TableRow>
                    <TableHead scope="col" className="px-5">Symbol</TableHead>
                    <TableHead scope="col">Strategy</TableHead>
                    <TableHead scope="col">Decision</TableHead>
                    <TableHead scope="col">Result</TableHead>
                    <TableHead scope="col" className="text-right">Shares</TableHead>
                    <TableHead scope="col" className="text-right">Price</TableHead>
                    <TableHead scope="col" className="pr-5">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.decisions.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="px-5 font-semiwide font-bold">{d.symbol}</TableCell>
                      <TableCell>{getStrategy(d.strategyId).name}</TableCell>
                      <TableCell><ActionBadge action={d.action} /></TableCell>
                      <TableCell><ResultBadge status={d.status} /></TableCell>
                      <TableCell className="text-right tabular-nums">{d.qty ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.priceCents !== null ? money(d.priceCents) : "—"}</TableCell>
                      <TableCell className="min-w-56 pr-5 text-slate-700">{d.message ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ResultBadge({ status }: { status: BotDecisionDTO["status"] }) {
  switch (status) {
    case "SUBMITTED":
      return <Badge tone="positive">Order placed</Badge>;
    case "DRY_RUN":
      return <Badge tone="warning">Dry run</Badge>;
    case "FAILED":
      return <Badge tone="negative">Failed</Badge>;
    case "SKIPPED":
      return <Badge tone="neutral">Skipped</Badge>;
    default:
      return <Badge tone="neutral">No action</Badge>;
  }
}
