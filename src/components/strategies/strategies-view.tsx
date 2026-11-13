"use client";

import { Check, FlaskConical, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { StrategiesResponse, StrategyDTO } from "@/contracts/api";
import type { StrategyId } from "@/domain/strategies";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { ErrorState, InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function StrategiesView() {
  const strategies = useApi<StrategiesResponse>("strategies", api.getStrategies);
  const toast = useToast();
  const [switching, setSwitching] = useState<StrategyId | null>(null);

  async function makeDefault(strategy: StrategyDTO) {
    setSwitching(strategy.id);
    try {
      await api.patchSettings({ activeStrategyId: strategy.id });
      await strategies.reload();
      toast(`${strategy.name} is now the default strategy.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSwitching(null);
    }
  }

  const active = strategies.data?.strategies.find((s) => s.isDefault);

  return (
    <>
      <PageHeader
        title="Strategies"
        description={
          <>
            Choose the strategy the bot follows. Symbols without their own pick follow the default
            {active ? <>, currently <strong className="font-semibold text-slate-900">{active.name}</strong></> : null}. A change applies on the next bot run; nothing needs restarting.
          </>
        }
      />
      {strategies.error && <ErrorState message={strategies.error} onRetry={strategies.reload} className="mb-6" />}
      {strategies.data ? (
        <ul className="grid items-start gap-6 lg:grid-cols-2" data-testid="strategy-list">
          {strategies.data.strategies.map((s) => (
            <li key={s.id} className="min-w-0">
              <StrategyCard
                strategy={s}
                switching={switching === s.id}
                onMakeDefault={() => void makeDefault(s)}
                onChanged={() => void strategies.reload()}
              />
            </li>
          ))}
        </ul>
      ) : strategies.error ? null : (
        <LoadingRegion label="Loading strategies">
          <div className="grid gap-6 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardBody className="space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-20 w-full" />
                </CardBody>
              </Card>
            ))}
          </div>
        </LoadingRegion>
      )}
      <p className="mt-10 max-w-[80ch] text-xs leading-relaxed text-slate-600">
        These strategies are simple, rule-based examples, not advice. Backtests are hypothetical and past performance does not predict future results. Use the Backtest page to compare them on the stocks you care about before relying on one.
      </p>
    </>
  );
}

function StrategyCard({
  strategy: s,
  switching,
  onMakeDefault,
  onChanged,
}: {
  strategy: StrategyDTO;
  switching: boolean;
  onMakeDefault: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>(() => toDraft(s.current));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);

  // Re-sync the draft when the saved values change underneath it (after a save, reset or reload).
  const savedKey = JSON.stringify(s.current);
  const [syncedKey, setSyncedKey] = useState(savedKey);
  if (syncedKey !== savedKey) {
    setSyncedKey(savedKey);
    setDraft(toDraft(s.current));
    setErrors({});
  }

  const dirty = s.params.some((p) => Number(draft[p.key]) !== s.current[p.key] || draft[p.key] === "");
  const atDefaults = s.params.every((p) => Number(draft[p.key]) === s.defaults[p.key]);

  async function save() {
    setBusy("save");
    setErrors({});
    try {
      await api.saveStrategyParams(s.id, Object.fromEntries(s.params.map((p) => [p.key, draft[p.key] === "" ? NaN : Number(draft[p.key])])));
      onChanged();
      toast(`${s.name} parameters saved.`, "success");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
      else setErrors({ _root: [errorMessage(err)] });
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setErrors({});
    try {
      await api.resetStrategyParams(s.id);
      onChanged();
      toast(`${s.name} is back to its defaults.`, "success");
    } catch (err) {
      setErrors({ _root: [errorMessage(err)] });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={s.isDefault ? "ring-1 ring-brand-600" : undefined} data-testid={`strategy-${s.id}`}>
      <CardBody className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semiwide text-lg font-bold text-foreground">{s.name}</h2>
            <p className="mt-1 text-sm text-slate-700">{s.summary}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{s.style}</Badge>
            {s.isDefault && (
              <Badge tone="info" data-testid={`strategy-${s.id}-default`}>
                <Check className="mr-0.5 size-3" aria-hidden="true" /> Default
              </Badge>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Rules</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {s.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-600">{s.character}</p>
        </div>

        {s.params.length > 0 ? (
          <form
            className="space-y-4 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            aria-label={`${s.name} parameters`}
          >
            <h3 className="text-sm font-semibold text-foreground">Parameters</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {s.params.map((p) => (
                <Field key={p.key} label={p.label} hint={p.hint} error={errors[p.key]} testId={`${s.id}-${p.key}`}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={draft[p.key] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                    className="tabular-nums"
                    data-testid={`${s.id}-${p.key}`}
                  />
                </Field>
              ))}
            </div>
            {errors._root && <InlineStatus tone="error">{errors._root[0]}</InlineStatus>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={busy === "save"} disabled={!dirty} className="min-h-11" data-testid={`${s.id}-save`}>
                <Save className="size-4" aria-hidden="true" /> Save parameters
              </Button>
              {(s.customised || !atDefaults) && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy === "reset"}
                  onClick={() => (s.customised ? void reset() : setDraft(toDraft(s.defaults)))}
                  className="min-h-11"
                  data-testid={`${s.id}-reset`}
                >
                  <RotateCcw className="size-4" aria-hidden="true" /> Reset to defaults
                </Button>
              )}
            </div>
          </form>
        ) : (
          <p className="border-t border-border pt-4 text-sm text-slate-600">This strategy has no parameters.</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="min-w-0 text-sm text-slate-700" data-testid={`strategy-${s.id}-pinned`}>
            {s.pinnedSymbols.length > 0 ? (
              <>
                Pinned to{" "}
                <Link href="/watchlist" className="font-semibold underline underline-offset-4">
                  {s.pinnedSymbols.join(", ")}
                </Link>
              </>
            ) : (
              "Not pinned to any symbol."
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" size="sm" className="min-h-11">
              <Link href={`/backtest?strategy=${s.id}`}>
                <FlaskConical className="size-4" aria-hidden="true" /> Backtest
              </Link>
            </Button>
            {!s.isDefault && (
              <Button size="sm" loading={switching} onClick={onMakeDefault} className="min-h-11" data-testid={`strategy-${s.id}-make-default`}>
                Use as default
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

const toDraft = (params: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
