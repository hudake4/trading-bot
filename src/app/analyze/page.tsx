import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyzeView } from "@/components/analyze/analyze-view";

export const metadata: Metadata = { title: "Analyze" };

export default function AnalyzePage() {
  // useSearchParams needs a Suspense boundary so the page can still be prerendered.
  return (
    <Suspense>
      <AnalyzeView />
    </Suspense>
  );
}
