"use client";

import { useEffect, useState } from "react";
import type { SettingsDTO } from "@/contracts/api";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { applyTheme, currentTheme } from "@/lib/theme";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Switch } from "@/components/ui/field";
import { Skeleton, LoadingRegion } from "@/components/ui/skeleton";
import { ErrorState, InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function SettingsView({ appVersion }: { appVersion: string }) {
  const settings = useApi<SettingsDTO>("settings", api.getSettings);

  return (
    <>
      <PageHeader title="Settings" description="Connection, bot limits, appearance and data." />
      {settings.error && <ErrorState message={settings.error} onRetry={settings.reload} className="mb-6" />}
      {settings.data ? (
        <div className="grid max-w-3xl gap-8">
          <ConnectionCard data={settings.data} />
          <BotCard data={settings.data} onSaved={() => void settings.reload()} />
          {settings.data.connection.mode === "alpaca" && !settings.data.connection.paper && (
            <LiveCard data={settings.data} onChanged={() => void settings.reload()} />
          )}
          <AppearanceCard />
          <DataCard />
          <p className="text-xs text-slate-600" data-testid="app-version">TradeDesk v{appVersion}</p>
        </div>
      ) : settings.error ? null : (
        <LoadingRegion label="Loading settings">
          <Card><CardBody className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardBody></Card>
        </LoadingRegion>
      )}
    </>
  );
}

function ConnectionCard({ data }: { data: SettingsDTO }) {
  const c = data.connection;
  const label = c.mode === "demo" ? "Demo data" : c.paper ? "Paper account" : "LIVE account";
  const tone = c.mode === "demo" ? "warning" : c.paper ? "info" : "negative";
  return (
    <Card data-testid="connection-card">
      <CardHeader title="Alpaca connection" description="Your API keys are read from the .env file in the project folder. They are never stored in the app's database or shown here." />
      <CardBody className="space-y-4">
        <dl className="divide-y divide-border text-sm">
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-muted-foreground">Account</dt>
            <dd><Badge tone={tone} data-testid="connection-mode">{label}</Badge></dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-muted-foreground">Market data feed</dt>
            <dd className="font-semibold">{c.mode === "demo" ? "Synthetic" : c.dataFeed === "sip" ? "SIP (paid)" : "IEX (free)"}</dd>
          </div>
        </dl>
        {c.mode === "demo" ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p className="font-semibold text-foreground">To connect your Alpaca account</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Sign in at app.alpaca.markets, switch to the <strong>Paper</strong> account, and generate API keys.</li>
              <li>Open <code>.env</code> in the project folder and fill in <code>ALPACA_API_KEY</code> and <code>ALPACA_SECRET_KEY</code>.</li>
              <li>Stop and restart the app. This page will then show your paper account.</li>
            </ol>
            <p>Keep <code>ALPACA_PAPER=true</code> until the bot has behaved correctly on paper for a good while.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-700">
            To change accounts, edit <code>.env</code> (<code>ALPACA_PAPER</code>, the keys) and restart the app.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function BotCard({ data, onSaved }: { data: SettingsDTO; onSaved: () => void }) {
  const toast = useToast();
  const [dryRun, setDryRun] = useState(data.dryRun);
  const [enabled, setEnabled] = useState(data.botEnabled);
  const [position, setPosition] = useState(String(data.positionBps / 100));
  const [stop, setStop] = useState(String(data.stopLossBps / 100));
  const [maxPositions, setMaxPositions] = useState(String(data.maxPositions));
  const [delay, setDelay] = useState(String(data.entryDelayMinutes));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    setFailure(null);
    try {
      await api.patchSettings({
        botEnabled: enabled,
        dryRun,
        positionBps: Math.round(Number(position) * 100),
        stopLossBps: Math.round(Number(stop) * 100),
        maxPositions: Number(maxPositions),
        entryDelayMinutes: Number(delay),
      });
      onSaved();
      toast("Bot settings saved.", "success");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
      else setFailure(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-testid="bot-settings-card">
      <CardHeader title="Trading bot" description="The bot runs once each trading day, a few minutes after the open, only while this app is running." />
      <CardBody>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          aria-label="Trading bot settings"
        >
          <Switch checked={enabled} onChange={setEnabled} label="Run the bot automatically" description="Off means it only runs when you press Run now." testId="settings-bot-enabled" />
          <Switch checked={dryRun} onChange={setDryRun} label="Dry run" description="Log decisions without sending any orders. Turn this off to let the bot place orders on the connected account." testId="settings-dry-run" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Position size (% of equity)" hint="Each buy is capped at this share of account equity." error={errors.positionBps} testId="settings-position">
              <Input type="number" inputMode="decimal" min={0.1} max={50} step={0.5} value={position} onChange={(e) => setPosition(e.target.value)} className="tabular-nums" data-testid="settings-position-input" />
            </Field>
            <Field label="Stop-loss (% below entry)" hint="A protective stop is placed at Alpaca with each buy." error={errors.stopLossBps} testId="settings-stop">
              <Input type="number" inputMode="decimal" min={0.5} max={50} step={0.5} value={stop} onChange={(e) => setStop(e.target.value)} className="tabular-nums" data-testid="settings-stop-input" />
            </Field>
            <Field label="Maximum positions" hint="The bot won't open more than this many holdings." error={errors.maxPositions} testId="settings-max">
              <Input type="number" inputMode="numeric" min={1} max={50} step={1} value={maxPositions} onChange={(e) => setMaxPositions(e.target.value)} className="tabular-nums" data-testid="settings-max-input" />
            </Field>
            <Field label="Minutes after the open" hint="Wait this long after 9:30 a.m. New York time before running." error={errors.entryDelayMinutes} testId="settings-delay">
              <Input type="number" inputMode="numeric" min={0} max={120} step={1} value={delay} onChange={(e) => setDelay(e.target.value)} className="tabular-nums" data-testid="settings-delay-input" />
            </Field>
          </div>
          {failure && <InlineStatus tone="error">{failure}</InlineStatus>}
          <Button type="submit" variant="primary" loading={saving} className="min-h-11" data-testid="settings-save">
            Save bot settings
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function LiveCard({ data, onChanged }: { data: SettingsDTO; onChanged: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function set(acknowledged: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.patchSettings({ liveAcknowledged: acknowledged, liveConfirmText: acknowledged ? text : undefined });
      setText("");
      onChanged();
      toast(acknowledged ? "Live trading confirmed." : "Live trading turned off.", "success");
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors.liveConfirmText?.[0] ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="live-card">
      <CardHeader title="Live trading" description="This app is connected to a real-money Alpaca account." />
      <CardBody className="space-y-4">
        {data.liveAcknowledged ? (
          <>
            <InlineStatus tone="success">Live trading is confirmed. With Dry run off, the bot places real orders.</InlineStatus>
            <Button variant="danger" loading={busy} onClick={() => void set(false)} className="min-h-11" data-testid="live-revoke">
              Turn off live trading
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700">Until you confirm, the bot only logs decisions on this account, even with Dry run off. Trading can lose money, including more than a backtest suggests.</p>
            <form
              className="grid items-start gap-3 sm:grid-cols-[minmax(0,16rem)_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                void set(true);
              }}
            >
              <Field label="Type LIVE to confirm" error={error} testId="live-confirm">
                <Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} data-testid="live-confirm-input" />
              </Field>
              <div className="sm:pt-[1.625rem]">
                <Button type="submit" variant="danger" loading={busy} disabled={text.trim() === ""} className="min-h-11" data-testid="live-confirm-submit">
                  Confirm live trading
                </Button>
              </div>
            </form>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function AppearanceCard() {
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(currentTheme() === "dark"), []);
  return (
    <Card>
      <CardHeader title="Appearance" />
      <CardBody>
        <Switch
          checked={dark}
          onChange={(next) => {
            setDark(next);
            applyTheme(next ? "dark" : "light");
          }}
          label="Dark mode"
          description="Saved in this browser only."
          testId="settings-dark-mode"
        />
      </CardBody>
    </Card>
  );
}

function DataCard() {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  return (
    <Card>
      <CardHeader title="Data" description="Everything here lives in a local file on this computer." />
      <CardBody className="space-y-3">
        <p className="text-sm text-slate-700">
          Resetting clears the watchlist, saved strategy parameters, bot history and these settings. It never touches your Alpaca account, positions or orders.
        </p>
        <Button variant="danger" onClick={() => setConfirming(true)} className="min-h-11" data-testid="reset-data">
          Reset app data
        </Button>
      </CardBody>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reset all app data?"
        description="This deletes your watchlist, strategy settings, bot history and preferences. It can't be undone."
        confirmLabel="Reset everything"
        onConfirm={async () => {
          await api.resetAllData();
          setConfirming(false);
          toast("App data reset.", "success");
          window.location.assign("/");
        }}
      />
    </Card>
  );
}
