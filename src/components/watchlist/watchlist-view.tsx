"use client";

import { ArrowDown, ArrowUp, Eye, Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { BotAction, SignalDTO, SymbolDTO } from "@/contracts/api";
import { STRATEGIES, getStrategy, type StrategyId } from "@/domain/strategies";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Skeleton, LoadingRegion } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

const SUGGESTIONS = ["AAPL", "MSFT", "SPY"];

export function WatchlistView() {
  const symbols = useApi<SymbolDTO[]>("symbols", api.listSymbols);
  const signals = useApi<SignalDTO[]>("signals", api.getSignals);
  const settings = useApi("settings", api.getSettings);
  const toast = useToast();

  const [ticker, setTicker] = useState("");
  const [pin, setPin] = useState<StrategyId | "">("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SymbolDTO | null>(null);

  const defaultName = settings.data ? getStrategy(settings.data.activeStrategyId).name : "default";
  const signalFor = (symbol: string) => signals.data?.find((s) => s.symbol === symbol);

  async function add(symbol: string, strategyId: StrategyId | null) {
    setAdding(true);
    setAddError(null);
    try {
      await api.addSymbol(symbol, strategyId);
      setTicker("");
      await Promise.all([symbols.reload(), signals.reload()]);
      toast(`${symbol.toUpperCase()} added to the watchlist.`, "success");
    } catch (err) {
      setAddError(err instanceof ApiError ? (err.fieldErrors.symbol?.[0] ?? err.message) : errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function patch(row: SymbolDTO, change: { strategyId?: StrategyId | null; enabled?: boolean }) {
    try {
      await api.patchSymbol(row.id, change);
      await symbols.reload();
      if ("strategyId" in change || "enabled" in change) void signals.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Watchlist"
        description="The stocks the bot manages. Each follows the default strategy unless you pin it to a different one."
        actions={
          <Button size="sm" loading={signals.refreshing} onClick={() => void signals.reload()} className="min-h-11" data-testid="watchlist-refresh">
            <RefreshCw className="size-4" aria-hidden="true" /> Refresh signals
          </Button>
        }
      />

      <Card className="mb-8">
        <CardBody>
          <form
            className="grid items-start gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,16rem)_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void add(ticker, pin || null);
            }}
            aria-label="Add a symbol"
          >
            <Field label="Ticker" error={addError} testId="add-symbol">
              <Input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                maxLength={7}
                autoComplete="off"
                spellCheck={false}
                data-testid="add-symbol-input"
              />
            </Field>
            <Field label="Strategy">
              <Select value={pin} onChange={(e) => setPin(e.target.value as StrategyId | "")} data-testid="add-symbol-strategy">
                <option value="">Follow default ({defaultName})</option>
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:pt-[1.625rem]">
              <Button type="submit" variant="primary" loading={adding} disabled={ticker.trim() === ""} className="w-full min-h-11 sm:w-auto" data-testid="add-symbol-submit">
                <Plus className="size-4" aria-hidden="true" /> Add symbol
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {symbols.error && <ErrorState message={symbols.error} onRetry={symbols.reload} className="mb-6" />}

      {symbols.data && symbols.data.length === 0 && (
        <EmptyState
          icon={<Eye className="size-6" />}
          title="Nothing on the watchlist yet"
          description="Add the stocks you want the bot to manage. Until you do, it has nothing to trade."
          testId="watchlist-empty"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="secondary" size="sm" className="min-h-11" onClick={() => void add(s, null)}>
                  <Plus className="size-4" aria-hidden="true" /> {s}
                </Button>
              ))}
            </div>
          }
        />
      )}

      {symbols.data && symbols.data.length > 0 && (
        <Card>
          <div className="overflow-x-auto" role="region" aria-label="Watchlist table" tabIndex={0}>
            <Table className="w-full min-w-[56rem] text-sm" data-testid="watchlist-table">
              <TableCaption className="sr-only">Watched symbols with their strategy, current signal and what the bot would do next</TableCaption>
              <TableHeader className="bg-muted text-left text-xs text-muted-foreground">
                <TableRow>
                  <TableHead scope="col" className="px-4">Symbol</TableHead>
                  <TableHead scope="col">Strategy</TableHead>
                  <TableHead scope="col">Signal</TableHead>
                  <TableHead scope="col">Bot would</TableHead>
                  <TableHead scope="col" className="text-right">Last close</TableHead>
                  <TableHead scope="col" className="text-right">Held</TableHead>
                  <TableHead scope="col">Trading</TableHead>
                  <TableHead scope="col" className="w-12 pr-4"><span className="sr-only">Remove</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {symbols.data.map((row) => (
                  <WatchRow
                    key={row.id}
                    row={row}
                    defaultName={defaultName}
                    signal={signalFor(row.symbol)}
                    signalsLoading={signals.loading}
                    onPatch={(change) => void patch(row, change)}
                    onRemove={() => setRemoving(row)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {!symbols.data && !symbols.error && (
        <LoadingRegion label="Loading watchlist">
          <Card><CardBody className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardBody></Card>
        </LoadingRegion>
      )}
      {signals.error && symbols.data && symbols.data.length > 0 && (
        <p role="alert" className="mt-4 text-sm text-rose-800" data-testid="signals-error">
          Signals couldn&apos;t be loaded: {signals.error}
        </p>
      )}

      <p className="mt-6 max-w-[80ch] text-xs leading-relaxed text-slate-600">
        Signals use completed daily bars only. &quot;Bot would&quot; is what the next run would do given your current positions; asking places no orders.
      </p>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.symbol ?? ""} from the watchlist?`}
        description="The bot stops managing it. Any position you hold stays open at Alpaca until you close it."
        confirmLabel="Remove symbol"
        onConfirm={async () => {
          if (!removing) return;
          await api.removeSymbol(removing.id);
          await Promise.all([symbols.reload(), signals.reload()]);
          setRemoving(null);
          toast(`${removing.symbol} removed.`, "success");
        }}
      />
    </>
  );
}

function WatchRow({
  row,
  defaultName,
  signal,
  signalsLoading,
  onPatch,
  onRemove,
}: {
  row: SymbolDTO;
  defaultName: string;
  signal: SignalDTO | undefined;
  signalsLoading: boolean;
  onPatch: (change: { strategyId?: StrategyId | null; enabled?: boolean }) => void;
  onRemove: () => void;
}) {
  return (
    <TableRow data-testid={`watch-row-${row.symbol}`} className={row.enabled ? undefined : "text-muted-foreground"}>
      <TableCell className="px-4 font-semiwide font-bold">{row.symbol}</TableCell>
      <TableCell className="min-w-56">
        <Select
          aria-label={`Strategy for ${row.symbol}`}
          value={row.strategyId ?? ""}
          onChange={(e) => onPatch({ strategyId: (e.target.value || null) as StrategyId | null })}
          data-testid={`watch-strategy-${row.symbol}`}
        >
          <option value="">Follow default ({defaultName})</option>
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </TableCell>
      {signal ? (
        <>
          <TableCell>
            {signal.ok ? (
              <Badge tone={signal.signal === 1 ? "positive" : "neutral"}>{signal.signal === 1 ? "Long" : "Flat"}</Badge>
            ) : (
              <span className="text-xs text-slate-600" title={signal.reason ?? undefined}>
                No signal
              </span>
            )}
          </TableCell>
          <TableCell>
            {signal.action ? <ActionBadge action={signal.action} /> : <span className="text-xs text-slate-600">{signal.reason}</span>}
          </TableCell>
          <TableCell className="text-right tabular-nums">{signal.priceCents !== null ? money(signal.priceCents) : "—"}</TableCell>
          <TableCell className="text-right tabular-nums">{signal.heldQty || "—"}</TableCell>
        </>
      ) : (
        <>
          {[0, 1, 2, 3].map((i) => (
            <TableCell key={i}>{signalsLoading ? <Skeleton className="h-5 w-16" /> : "—"}</TableCell>
          ))}
        </>
      )}
      <TableCell>
        <Switch checked={row.enabled} onChange={(enabled) => onPatch({ enabled })} label={row.enabled ? "On" : "Off"} testId={`watch-enabled-${row.symbol}`} />
      </TableCell>
      <TableCell className="pr-4">
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${row.symbol}`} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0" data-testid={`watch-remove-${row.symbol}`}>
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function ActionBadge({ action }: { action: BotAction }) {
  if (action === "BUY") {
    return (
      <Badge tone="positive">
        <ArrowUp className="mr-0.5 size-3" aria-hidden="true" /> Buy
      </Badge>
    );
  }
  if (action === "SELL") {
    return (
      <Badge tone="negative">
        <ArrowDown className="mr-0.5 size-3" aria-hidden="true" /> Sell
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <Minus className="mr-0.5 size-3" aria-hidden="true" /> Hold
    </Badge>
  );
}
