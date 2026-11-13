import type { Metadata } from "next";
import { Suspense } from "react";
import { BacktestView } from "@/components/backtest/backtest-view";

export const metadata: Metadata = { title: "Backtest" };

export default function BacktestPage() {
  // useSearchParams needs a Suspense boundary so the page can still be prerendered.
  return (
    <Suspense>
      <BacktestView />
    </Suspense>
  );
}
