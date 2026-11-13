"use client";

import { FlaskConical, Info } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BacktestResponse, BacktestRunDTO } from "@/contracts/api";
import { STRATEGIES, isStrategyId, type StrategyId } from "@/domain/strategies";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { fmtDate } from "@/lib/dates";
import { dollars, pct, signedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app-shell";
import { LineSwatch } from "@/components/analyze/analyze-view";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, InlineStatus } from "@/components/ui/states";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

const YEARS = [1, 2, 3, 5, 10];
const MAX_POINTS = 500;

/** Color + dash combinations that stay distinct in both themes (the dark palette is nearly monochrome). */
const LINE_STYLES = [
  { color: "var(--color-brand-600)" },
  { color: "var(--color-emerald-700)" },
  { color: "var(--color-rose-700)" },
  { color: "var(--color-brand-600)", dash: "6 3" },
  { color: "var(--color-emerald-700)", dash: "6 3" },
  { color: "var(--color-rose-700)", dash: "6 3" },
];
const BENCHMARK_STYLE = { color: "var(--color-slate-500)", dash: "2 3" };

/** Distinct from the "Buy and hold" strategy, which enters a day later and so differs slightly. */
const BENCHMARK_NAME = "Benchmark: hold from day one";

/** Two decimals without a negative zero. */
const sharpe = (value: number) => (Math.abs(value) < 0.005 ? "0.00" : value.toFixed(2));

export function BacktestView() {
  const params = useSearchParams();
  const toast = useToast();
  const initial = params.get("strategy");

  const [symbol, setSymbol] = useState(params.get("symbol")?.toUpperCase() ?? "");
  const [years, setYears] = useState(5);
  const [costBps, setCostBps] = useState("5");
  const [picked, setPicked] = useState<StrategyId[]>(isStrategyId(initial) ? [initial] : STRATEGIES.map((s) => s.id));
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function run() {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api.backtest({ symbol, strategyIds: picked, years, costBps: Number(costBps) });
      setResult(res);
      setHidden(new Set());
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setFieldErrors(err.fieldErrors);
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function makeDefault(run: BacktestRunDTO) {
    try {
      await api.patchSettings({ activeStrategyId: run.strategyId });
      toast(`${run.strategyName} is now the default strategy.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const toggle = (id: StrategyId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <>
      <PageHeader title="Backtest" description="See how strategies would have done on a stock's past prices, next to simply holding it. Then switch the bot to the one you trust." />

      <Card className="mb-8">
        <CardBody>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
            aria-label="Run a backtest"
          >
            <div className="grid items-start gap-4 sm:grid-cols-3 lg:grid-cols-[minmax(0,10rem)_minmax(0,10rem)_minmax(0,10rem)_auto]">
              <Field label="Ticker" error={fieldErrors.symbol} testId="bt-symbol">
                <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL" maxLength={7} autoComplete="off" spellCheck={false} data-testid="bt-symbol-input" />
              </Field>
              <Field label="History">
                <Select value={years} onChange={(e) => setYears(Number(e.target.value))} data-testid="bt-years">
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y} {y === 1 ? "year" : "years"}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Cost per trade (bps)" hint="5 bps = 0.05%." error={fieldErrors.costBps} testId="bt-cost">
                <Input type="number" inputMode="decimal" min={0} max={200} step={1} value={costBps} onChange={(e) => setCostBps(e.target.value)} className="tabular-nums" data-testid="bt-cost-input" />
              </Field>
              <div className="sm:col-span-3 lg:col-span-1 lg:pt-[1.625rem]">
                <Button type="submit" variant="primary" loading={loading} disabled={symbol.trim() === "" || picked.length === 0} className="w-full min-h-11 lg:w-auto" data-testid="bt-run">
                  <FlaskConical className="size-4" aria-hidden="true" /> Run backtest
                </Button>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">Strategies to compare</legend>
              <div className="flex flex-wrap gap-2">
                {STRATEGIES.map((s) => {
                  const on = picked.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        on ? "border-brand-600 bg-accent text-foreground" : "border-border bg-sheet text-slate-700 hover:border-slate-400",
                      )}
                    >
                      <input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={on} onChange={() => toggle(s.id)} data-testid={`bt-pick-${s.id}`} />
                      {s.name}
                    </label>
                  );
                })}
              </div>
              {fieldErrors.strategyIds && <p role="alert" className="text-xs font-medium text-rose-800">{fieldErrors.strategyIds[0]}</p>}
              <p className="text-xs text-muted-foreground">Each strategy uses the parameters saved on the Strategies page.</p>
            </fieldset>
            {fieldErrors._root && <InlineStatus tone="error">{fieldErrors._root[0]}</InlineStatus>}
          </form>
        </CardBody>
      </Card>

      {error && <ErrorState message={error} onRetry={() => void run()} title="The backtest failed" className="mb-6" />}
      {loading && !result && (
        <LoadingRegion label="Running backtest">
          <Card><CardBody className="space-y-4"><Skeleton className="h-6 w-56" /><Skeleton className="h-40 w-full" /><Skeleton className="h-72 w-full" /></CardBody></Card>
        </LoadingRegion>
      )}
      {!result && !loading && !error && (
        <EmptyState icon={<FlaskConical className="size-6" />} title="Test strategies on a stock" description="Enter a ticker and choose the strategies to compare. Results show return, risk and how often each one traded." testId="bt-empty" />
      )}

      {result && (
        <div className="space-y-8" aria-busy={loading || undefined} data-testid="bt-result">
          <ResultsTable result={result} onMakeDefault={(r) => void makeDefault(r)} />
          <EquityCard result={result} hidden={hidden} onToggle={(key) => setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else n.add(key); return n; })} />
          <p className="flex max-w-[80ch] items-start gap-2 text-xs leading-relaxed text-slate-600" data-testid="bt-disclaimer">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Hypothetical results on adjusted daily prices from {fmtDate(result.from)} to {fmtDate(result.to)}{result.source === "demo" ? " (synthetic demo data)" : ""}. Each signal is traded at the next day&apos;s open with {result.costBps} bps per trade; taxes, slippage beyond that, and partial fills are ignored. Choosing the best performer on past data overfits: prefer strategies that hold up across several stocks and periods. Past performance does not predict future results.
          </p>
        </div>
      )}
    </>
  );
}

function ResultsTable({ result, onMakeDefault }: { result: BacktestResponse; onMakeDefault: (run: BacktestRunDTO) => void }) {
  const runs = [...result.runs].sort((a, b) => b.metrics.totalReturn - a.metrics.totalReturn);
  const b = result.benchmark.metrics;
  return (
    <Card>
      <CardHeader title={`${result.symbol}: strategies vs. buy and hold`} description="Ranked by total return. Buy and hold is the benchmark every strategy has to beat." />
      <div className="mt-4 overflow-x-auto" role="region" aria-label="Backtest results table" tabIndex={0}>
        <Table className="w-full min-w-[52rem] text-sm" data-testid="bt-table">
          <TableCaption className="sr-only">Backtest metrics per strategy</TableCaption>
          <TableHeader className="bg-muted text-left text-xs text-muted-foreground">
            <TableRow>
              <TableHead scope="col" className="px-5">Strategy</TableHead>
              <TableHead scope="col" className="text-right">Total return</TableHead>
              <TableHead scope="col" className="text-right">Per year</TableHead>
              <TableHead scope="col" className="text-right">Sharpe</TableHead>
              <TableHead scope="col" className="text-right">Max drawdown</TableHead>
              <TableHead scope="col" className="text-right">Win rate</TableHead>
              <TableHead scope="col" className="text-right">Trades</TableHead>
              <TableHead scope="col" className="text-right">In market</TableHead>
              <TableHead scope="col" className="pr-5"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.strategyId} data-testid={`bt-row-${r.strategyId}`}>
                <TableCell className="px-5 font-semibold">{r.strategyName}</TableCell>
                <TableCell className="text-right tabular-nums">{signedPct(r.metrics.totalReturn)}</TableCell>
                <TableCell className="text-right tabular-nums">{signedPct(r.metrics.cagr)}</TableCell>
                <TableCell className="text-right tabular-nums">{sharpe(r.metrics.sharpe)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.metrics.maxDrawdown)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.winRate === null ? "—" : pct(r.winRate, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.roundTrips}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.timeInMarket, 0)}</TableCell>
                <TableCell className="pr-5 text-right">
                  <Button size="sm" onClick={() => onMakeDefault(r)} className="min-h-11" data-testid={`bt-default-${r.strategyId}`}>
                    Use as default
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50" data-testid="bt-row-benchmark">
              <TableCell className="px-5 font-semibold">{BENCHMARK_NAME}</TableCell>
              <TableCell className="text-right tabular-nums">{signedPct(b.totalReturn)}</TableCell>
              <TableCell className="text-right tabular-nums">{signedPct(b.cagr)}</TableCell>
              <TableCell className="text-right tabular-nums">{sharpe(b.sharpe)}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(b.maxDrawdown)}</TableCell>
              <TableCell className="text-right text-muted-foreground">—</TableCell>
              <TableCell className="text-right tabular-nums">1</TableCell>
              <TableCell className="text-right tabular-nums">100%</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function EquityCard({ result, hidden, onToggle }: { result: BacktestResponse; hidden: Set<string>; onToggle: (key: string) => void }) {
  const series = useMemo(
    () => [
      ...result.runs.map((r, i) => ({ key: r.strategyId as string, name: r.strategyName, values: r.equity, style: LINE_STYLES[i % LINE_STYLES.length] })),
      { key: "benchmark", name: BENCHMARK_NAME, values: result.benchmark.equity, style: BENCHMARK_STYLE },
    ],
    [result],
  );

  // Thin long histories so the chart stays responsive; the table above holds the exact figures.
  const data = useMemo(() => {
    const step = Math.max(1, Math.ceil(result.dates.length / MAX_POINTS));
    const rows: Record<string, number | string>[] = [];
    for (let i = 0; i < result.dates.length; i += step) rows.push(rowAt(i));
    if ((result.dates.length - 1) % step !== 0) rows.push(rowAt(result.dates.length - 1));
    return rows;

    function rowAt(i: number) {
      const row: Record<string, number | string> = { date: result.dates[i] };
      for (const s of series) row[s.key] = s.values[i];
      return row;
    }
  }, [result, series]);

  const finals = series.map((s) => `${s.name} ${dollars(s.values[s.values.length - 1])}`).join("; ");

  return (
    <Card>
      <CardHeader title="Growth of $10,000" description="Hypothetical value over time. Use the buttons to show or hide a line." />
      <CardBody>
        <figure className="space-y-3" data-testid="bt-chart">
          <ul className="flex flex-wrap gap-2" aria-label="Chart lines">
            {series.map((s) => {
              const off = hidden.has(s.key);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-pressed={!off}
                    onClick={() => onToggle(s.key)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1 rounded-control border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      off ? "border-border bg-transparent text-slate-500 line-through" : "border-slate-300 bg-sheet text-slate-800 hover:border-slate-400",
                    )}
                  >
                    <LineSwatch color={s.style.color} dash={"dash" in s.style ? s.style.dash : undefined} /> {s.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="h-80 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-slate-200)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d, "MMM yyyy")} tick={{ fontSize: 12, fill: "var(--color-slate-600)" }} tickLine={false} axisLine={{ stroke: "var(--color-slate-300)" }} minTickGap={48} />
                <YAxis tickFormatter={(v: number) => dollars(v)} tick={{ fontSize: 12, fill: "var(--color-slate-600)" }} tickLine={false} axisLine={false} width={68} domain={["auto", "auto"]} />
                {series.filter((s) => !hidden.has(s.key)).map((s) => (
                  <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.style.color} strokeDasharray={"dash" in s.style ? s.style.dash : undefined} strokeWidth={s.key === "benchmark" ? 2 : 1.75} dot={false} isAnimationActive={false} />
                ))}
                <Tooltip
                  cursor={{ stroke: "var(--color-slate-400)", strokeWidth: 1 }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="rounded-control border border-slate-200 bg-sheet px-3 py-2 text-xs shadow-[0_8px_24px_-10px_rgb(23_42_51/0.35)]">
                        <p className="text-slate-500">{fmtDate(String(label), "EEE, MMM d, yyyy")}</p>
                        {payload.map((p) => (
                          <p key={String(p.dataKey)} className="tabular-nums text-slate-900">
                            {p.name}: <span className="font-semibold">{dollars(Number(p.value))}</span>
                          </p>
                        ))}
                      </div>
                    ) : null
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="text-sm text-slate-700">Ending values from $10,000: {finals}.</figcaption>
        </figure>
      </CardBody>
    </Card>
  );
}
