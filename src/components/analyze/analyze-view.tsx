"use client";

import { ChevronDown, ChevronUp, Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyzeResponse } from "@/contracts/api";
import type { ChartRow } from "@/domain/analysis";
import { STRATEGIES, type StrategyId } from "@/domain/strategies";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { fmtDate } from "@/lib/dates";
import { dollars, pct, signedPct } from "@/lib/format";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Expandable, ExpandableContent, ExpandableTrigger } from "@/components/ui/expandable";
import { Field, Input, Select } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

const RANGES = [
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
];

const AXIS = { fontSize: 12, fill: "var(--color-slate-600)" };

export function AnalyzeView() {
  const params = useSearchParams();
  const toast = useToast();
  const [ticker, setTicker] = useState(params.get("symbol")?.toUpperCase() ?? "");
  const [days, setDays] = useState(365);
  const [strategy, setStrategy] = useState<StrategyId | "">("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function run(symbol = ticker) {
    setLoading(true);
    setError(null);
    setFieldError(null);
    try {
      setResult(await api.analyze(symbol, days, strategy || undefined));
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.symbol) setFieldError(err.fieldErrors.symbol[0]);
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // A link such as /analyze?symbol=AAPL analyzes straight away.
  const auto = useRef(false);
  useEffect(() => {
    if (!auto.current && ticker) {
      auto.current = true;
      void run(ticker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addToWatchlist() {
    if (!result) return;
    try {
      await api.addSymbol(result.symbol);
      toast(`${result.symbol} added to the watchlist.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader title="Analyze" description="Look at one stock's price, trend and momentum, and see what a strategy says about it today." />

      <Card className="mb-8">
        <CardBody>
          <form
            className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,10rem)_minmax(0,10rem)_minmax(0,16rem)_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
            aria-label="Analyze a stock"
          >
            <Field label="Ticker" error={fieldError} testId="analyze-symbol">
              <Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" maxLength={7} autoComplete="off" spellCheck={false} data-testid="analyze-symbol-input" />
            </Field>
            <Field label="Period">
              <Select value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="analyze-range">
                {RANGES.map((r) => (
                  <option key={r.days} value={r.days}>{r.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Strategy signal">
              <Select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyId | "")} data-testid="analyze-strategy">
                <option value="">Default strategy</option>
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:pt-[1.625rem]">
              <Button type="submit" variant="primary" loading={loading} disabled={ticker.trim() === ""} className="w-full min-h-11 sm:w-auto" data-testid="analyze-submit">
                <Search className="size-4" aria-hidden="true" /> Analyze
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {error && <ErrorState message={error} onRetry={() => void run()} title="Couldn't analyze that stock" className="mb-6" />}
      {loading && !result && <AnalyzeSkeleton />}
      {!result && !loading && !error && (
        <EmptyState icon={<Search className="size-6" />} title="Pick a stock to analyze" description="Enter a ticker above to see its chart, indicators and the current strategy signal." testId="analyze-empty" />
      )}
      {result && (
        <div className="space-y-8" aria-busy={loading || undefined} data-testid="analyze-result">
          <SnapshotCard result={result} onAdd={() => void addToWatchlist()} />
          <PriceCard rows={result.rows} symbol={result.symbol} />
          <div className="grid gap-8 lg:grid-cols-2">
            <RsiCard rows={result.rows} />
            <MacdCard rows={result.rows} />
          </div>
        </div>
      )}
    </>
  );
}

function AnalyzeSkeleton() {
  return (
    <LoadingRegion label="Analyzing">
      <Card><CardBody className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></CardBody></Card>
    </LoadingRegion>
  );
}

function Stat({ label, children, id }: { label: string; children: React.ReactNode; id: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5" data-testid={`stat-${id}`}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-semibold tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

function SnapshotCard({ result, onAdd }: { result: AnalyzeResponse; onAdd: () => void }) {
  const s = result.snapshot;
  const rsiNote = s.rsi >= 70 ? "Overbought" : s.rsi <= 30 ? "Oversold" : "Neutral";
  return (
    <Card>
      <CardHeader
        title={`${result.symbol} · ${dollars(s.last, 2)}`}
        description={`As of the ${fmtDate(s.asOf)} close${result.source === "demo" ? " (synthetic demo data)" : ""}.`}
        action={
          <Button variant="secondary" size="sm" onClick={onAdd} className="min-h-11" data-testid="analyze-add">
            <Plus className="size-4" aria-hidden="true" /> Add to watchlist
          </Button>
        }
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-2" data-testid="analyze-signal">
          <span className="text-sm text-muted-foreground">{result.strategy.name} says</span>
          <Badge tone={s.signal === 1 ? "positive" : "neutral"}>{s.signal === 1 ? "Long: own it" : "Flat: stay out"}</Badge>
        </div>
        <dl className="grid gap-x-10 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3 [&>div]:border-b [&>div]:border-border sm:[&>div]:border-b">
          <Stat id="ret1m" label="1 month">{signedPct(s.ret1m)}</Stat>
          <Stat id="ret3m" label="3 months">{signedPct(s.ret3m)}</Stat>
          <Stat id="retytd" label="Year to date">{signedPct(s.retYtd)}</Stat>
          <Stat id="vol" label="Volatility (annualized)">{pct(s.volatility)}</Stat>
          <Stat id="dd" label="Max drawdown">{pct(s.maxDrawdown)}</Stat>
          <Stat id="atr" label="Daily range (ATR)">{pct(s.atrPct, 2)}</Stat>
          <Stat id="rsi" label="RSI (14)">{s.rsi.toFixed(0)} · {rsiNote}</Stat>
          <Stat id="trend" label="Trend (SMA 20 vs 50)">{s.trend === "up" ? "Up" : "Down"}</Stat>
          <Stat id="macd" label="MACD">{s.macd === "bullish" ? "Bullish" : "Bearish"}</Stat>
          <Stat id="pctb" label="Bollinger %B">{Number.isFinite(s.pctB) ? s.pctB.toFixed(2) : "—"}</Stat>
        </dl>
      </CardBody>
    </Card>
  );
}

/** Contiguous stretches where the strategy wanted to be long, as [first date, last date] pairs. */
function longStretches(rows: ChartRow[]): [string, string][] {
  const out: [string, string][] = [];
  let start: string | null = null;
  rows.forEach((r, i) => {
    if (r.signal === 1 && start === null) start = r.date;
    if (start !== null && (r.signal !== 1 || i === rows.length - 1)) {
      out.push([start, r.signal === 1 ? r.date : rows[i - 1].date]);
      start = null;
    }
  });
  return out;
}

function PriceCard({ rows, symbol }: { rows: ChartRow[]; symbol: string }) {
  const [showTable, setShowTable] = useState(false);
  const stretches = useMemo(() => longStretches(rows), [rows]);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const summary = `${symbol} moved from ${dollars(first.close, 2)} on ${fmtDate(first.date, "MMM d")} to ${dollars(last.close, 2)} on ${fmtDate(last.date, "MMM d")}. The strategy was long for ${stretches.length} stretch${stretches.length === 1 ? "" : "es"} in this period (shaded).`;

  return (
    <Card>
      <CardHeader title="Price" description="Close with 20- and 50-day averages and Bollinger bands. Green shading marks when the strategy would be long." />
      <CardBody>
        <figure className="space-y-3" data-testid="price-chart">
          <div className="h-80 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-slate-200)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d, "MMM d")} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-slate-300)" }} minTickGap={40} />
                <YAxis tickFormatter={(v: number) => dollars(v)} tick={AXIS} tickLine={false} axisLine={false} width={64} domain={["auto", "auto"]} />
                {stretches.map(([x1, x2]) => (
                  <ReferenceArea key={x1} x1={x1} x2={x2} fill="var(--color-emerald-700)" fillOpacity={0.1} ifOverflow="hidden" />
                ))}
                <Line dataKey="bbUpper" stroke="var(--color-slate-400)" strokeDasharray="3 3" dot={false} strokeWidth={1} isAnimationActive={false} connectNulls />
                <Line dataKey="bbLower" stroke="var(--color-slate-400)" strokeDasharray="3 3" dot={false} strokeWidth={1} isAnimationActive={false} connectNulls />
                <Line dataKey="sma50" stroke="var(--color-emerald-700)" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                <Line dataKey="sma20" stroke="var(--color-brand-600)" strokeDasharray="6 3" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                <Line dataKey="close" stroke="var(--color-slate-900)" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Tooltip
                  cursor={{ stroke: "var(--color-slate-400)", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const p = active && (payload?.[0]?.payload as ChartRow | undefined);
                    if (!p) return null;
                    return (
                      <div className="rounded-control border border-slate-200 bg-sheet px-3 py-2 text-xs shadow-[0_8px_24px_-10px_rgb(23_42_51/0.35)]">
                        <p className="text-slate-500">{fmtDate(p.date, "EEE, MMM d, yyyy")}</p>
                        <p className="font-semibold text-slate-900 tabular-nums">Close {dollars(p.close, 2)}</p>
                        {p.sma20 !== null && <p className="text-slate-700 tabular-nums">SMA 20 {dollars(p.sma20, 2)}</p>}
                        {p.sma50 !== null && <p className="text-slate-700 tabular-nums">SMA 50 {dollars(p.sma50, 2)}</p>}
                      </div>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-700" aria-label="Chart key">
            <li><LineSwatch color="var(--color-slate-900)" /> Close</li>
            <li><LineSwatch color="var(--color-brand-600)" dash="6 3" /> SMA 20</li>
            <li><LineSwatch color="var(--color-emerald-700)" /> SMA 50</li>
            <li><LineSwatch color="var(--color-slate-400)" dash="3 3" /> Bollinger (20, 2)</li>
          </ul>
          <figcaption className="text-sm text-slate-700">{summary}</figcaption>
          <Expandable expanded={showTable} onToggle={() => setShowTable((o) => !o)} transitionDuration={0.18}>
            {({ isExpanded }) => (
              <>
                <ExpandableTrigger
                  aria-label={`${isExpanded ? "Hide" : "Show"} recent prices as a table`}
                  className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isExpanded ? "Hide" : "Show"} recent prices as a table
                  {isExpanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
                </ExpandableTrigger>
                <ExpandableContent preset="fade">
                  <div className="max-h-64 overflow-auto rounded-control border border-border">
                    <Table className="w-full text-sm">
                      <TableCaption className="sr-only">Last 60 closes with averages and the strategy position</TableCaption>
                      <TableHeader className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                        <TableRow>
                          <TableHead scope="col">Date</TableHead>
                          <TableHead scope="col" className="text-right">Close</TableHead>
                          <TableHead scope="col" className="text-right">SMA 20</TableHead>
                          <TableHead scope="col" className="text-right">SMA 50</TableHead>
                          <TableHead scope="col">Strategy</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...rows].slice(-60).reverse().map((r) => (
                          <TableRow key={r.date}>
                            <TableCell>{fmtDate(r.date, "EEE, MMM d")}</TableCell>
                            <TableCell className="text-right tabular-nums">{dollars(r.close, 2)}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.sma20 !== null ? dollars(r.sma20, 2) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.sma50 !== null ? dollars(r.sma50, 2) : "—"}</TableCell>
                            <TableCell>{r.signal === 1 ? "Long" : "Flat"}</TableCell>
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
      </CardBody>
    </Card>
  );
}

export function LineSwatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="22" height="8" className="mr-1 inline-block align-middle" aria-hidden="true">
      <line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} />
    </svg>
  );
}

function RsiCard({ rows }: { rows: ChartRow[] }) {
  const last = rows[rows.length - 1].rsi;
  return (
    <Card>
      <CardHeader title="RSI (14)" description="Above 70 is stretched upward; below 30 is stretched downward." />
      <CardBody>
        <figure className="space-y-2" data-testid="rsi-chart">
          <div className="h-44 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-slate-200)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d, "MMM d")} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-slate-300)" }} minTickGap={40} />
                <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={AXIS} tickLine={false} axisLine={false} width={36} />
                <ReferenceLine y={70} stroke="var(--color-rose-700)" strokeDasharray="4 3" />
                <ReferenceLine y={30} stroke="var(--color-emerald-700)" strokeDasharray="4 3" />
                <Line dataKey="rsi" stroke="var(--color-brand-600)" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                <Tooltip content={({ active, payload }) => {
                  const p = active && (payload?.[0]?.payload as ChartRow | undefined);
                  return p && p.rsi !== null ? (
                    <div className="rounded-control border border-slate-200 bg-sheet px-3 py-2 text-xs">
                      <p className="text-slate-500">{fmtDate(p.date, "MMM d, yyyy")}</p>
                      <p className="font-semibold tabular-nums">RSI {p.rsi.toFixed(1)}</p>
                    </div>
                  ) : null;
                }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="text-sm text-slate-700">{last !== null ? `RSI is ${last.toFixed(0)} at the latest close.` : "Not enough history for RSI."}</figcaption>
        </figure>
      </CardBody>
    </Card>
  );
}

function MacdCard({ rows }: { rows: ChartRow[] }) {
  const last = rows[rows.length - 1];
  return (
    <Card>
      <CardHeader title="MACD (12, 26, 9)" description="Bars show the gap between the MACD line and its signal line." />
      <CardBody>
        <figure className="space-y-2" data-testid="macd-chart">
          <div className="h-44 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-slate-200)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d, "MMM d")} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-slate-300)" }} minTickGap={40} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => v.toFixed(1)} />
                <ReferenceLine y={0} stroke="var(--color-slate-400)" />
                <Bar dataKey="macdHist" fill="var(--color-slate-400)" isAnimationActive={false} />
                <Line dataKey="macd" stroke="var(--color-brand-600)" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                <Line dataKey="macdSignal" stroke="var(--color-emerald-700)" strokeDasharray="6 3" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                <Tooltip content={({ active, payload }) => {
                  const p = active && (payload?.[0]?.payload as ChartRow | undefined);
                  return p && p.macd !== null ? (
                    <div className="rounded-control border border-slate-200 bg-sheet px-3 py-2 text-xs">
                      <p className="text-slate-500">{fmtDate(p.date, "MMM d, yyyy")}</p>
                      <p className="font-semibold tabular-nums">MACD {p.macd.toFixed(2)}</p>
                      {p.macdSignal !== null && <p className="tabular-nums">Signal {p.macdSignal.toFixed(2)}</p>}
                    </div>
                  ) : null;
                }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="text-sm text-slate-700">{last.macdHist !== null ? `MACD is ${last.macdHist > 0 ? "above" : "below"} its signal line (${last.macdHist > 0 ? "bullish" : "bearish"}).` : "Not enough history for MACD."}</figcaption>
        </figure>
      </CardBody>
    </Card>
  );
}
