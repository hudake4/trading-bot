"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate, fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { Expandable, ExpandableContent, ExpandableTrigger } from "@/components/ui/expandable";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Point = { date: string; equityCents: number };

/** Account equity at each close. Values are the API's `equityHistory` as-is. */
export function EquityChart({ history }: { history: Point[] }) {
  const [showTable, setShowTable] = useState(false);
  if (history.length < 2) return null;

  const first = history[0];
  const last = history[history.length - 1];
  const change = last.equityCents - first.equityCents;
  const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  const tick = (cents: number) => compact.format(Math.round(cents / 100));

  const summary =
    `Account equity goes from ${money(first.equityCents)} on ${fmtShort(first.date)} to ${money(last.equityCents)} on ${fmtShort(last.date)}, ` +
    `a ${change >= 0 ? "gain" : "loss"} of ${money(Math.abs(change))} (${((change / first.equityCents) * 100).toFixed(1)}%).`;

  return (
    <figure className="space-y-3" data-testid="equity-chart">
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-slate-200)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => fmtDate(d, "MMM d")}
              tick={{ fontSize: 12, fill: "var(--color-slate-600)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-slate-300)" }}
              minTickGap={32}
            />
            <YAxis tickFormatter={tick} tick={{ fontSize: 12, fill: "var(--color-slate-600)" }} tickLine={false} axisLine={false} width={60} domain={["auto", "auto"]} tickCount={5} />
            <Tooltip
              cursor={{ stroke: "var(--color-slate-400)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = active && (payload?.[0]?.payload as Point | undefined);
                if (!p) return null;
                return (
                  <div className="rounded-control border border-slate-200 bg-sheet px-3 py-2 text-xs shadow-[0_8px_24px_-10px_rgb(23_42_51/0.35)]">
                    <p className="text-slate-500">{fmtDate(p.date, "EEE, MMM d, yyyy")}</p>
                    <p className="font-semibold text-slate-900 tabular-nums">{money(p.equityCents)}</p>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="equityCents" stroke="var(--color-brand-600)" strokeWidth={2} fill="url(#equityFill)" isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-sheet)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-slate-700" data-testid="equity-summary">
        {summary}
      </figcaption>
      <Expandable expanded={showTable} onToggle={() => setShowTable((open) => !open)} transitionDuration={0.18}>
        {({ isExpanded }) => (
          <>
            <ExpandableTrigger
              aria-label={`${isExpanded ? "Hide" : "Show"} equity history as a table`}
              className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isExpanded ? "Hide" : "Show"} equity as a table
              {isExpanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            </ExpandableTrigger>
            <ExpandableContent preset="fade">
              <div className="max-h-64 overflow-auto rounded-control border border-border">
                <Table className="w-full text-sm">
                  <TableCaption className="sr-only">Account equity at each close</TableCaption>
                  <TableHeader className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <TableRow>
                      <TableHead scope="col">Date</TableHead>
                      <TableHead scope="col" className="text-right">Equity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...history].reverse().map((p) => (
                      <TableRow key={p.date}>
                        <TableCell>{fmtDate(p.date, "EEE, MMM d")}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.equityCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ExpandableContent>
          </>
        )}
      </Expandable>
    </figure>
  );
}
