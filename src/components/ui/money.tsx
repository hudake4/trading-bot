"use client";

import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { money, signedMoney } from "@/lib/format";
import { RollingNumber } from "./rolling-number";

/**
 * An account amount from the API. Negative amounts are red AND carry an alert icon plus an sr-only
 * label, so color is never the only signal.
 */
export function Balance({
  cents,
  currency = "USD",
  className,
  iconClassName = "h-3.5 w-3.5",
  testId,
}: {
  cents: number;
  currency?: string;
  className?: string;
  iconClassName?: string;
  testId?: string;
}) {
  const negative = cents < 0;
  return (
    <span
      data-testid={testId}
      data-negative={negative || undefined}
      className={cn("inline-flex items-center gap-1 tabular-nums", negative && "font-semibold text-rose-700", className)}
    >
      {negative && <TriangleAlert className={cn("shrink-0", iconClassName)} aria-hidden="true" />}
      {negative && <span className="sr-only">negative </span>}
      {money(cents, currency)}
    </span>
  );
}

/** Animated display-only amount with a static reduced-motion fallback. */
export function AnimatedBalance({
  cents,
  currency = "USD",
  className,
  testId,
}: {
  cents: number;
  currency?: string;
  className?: string;
  testId?: string;
}) {
  const reduceMotion = useReducedMotion();
  const formatted = money(cents, currency);
  return (
    <span data-testid={testId} className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {reduceMotion ? formatted : <RollingNumber value={cents} precision={0} format={(value) => money(Math.round(value), currency)} />}
      </span>
      <span className="sr-only">{formatted}</span>
    </span>
  );
}

/**
 * A gain or loss. Gains are green with a + and an up arrow; losses are red with a − and a down
 * arrow, so direction never depends on color alone.
 */
export function Pnl({
  cents,
  currency = "USD",
  suffix,
  className,
}: {
  cents: number;
  currency?: string;
  /** Extra text after the amount, e.g. a percentage. */
  suffix?: string;
  className?: string;
}) {
  const Icon = cents > 0 ? ArrowUp : cents < 0 ? ArrowDown : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums",
        cents > 0 ? "text-emerald-700" : cents < 0 ? "text-rose-700" : "text-slate-600",
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {signedMoney(cents, currency)}
      {suffix && <span className="ml-1 font-normal">{suffix}</span>}
    </span>
  );
}
