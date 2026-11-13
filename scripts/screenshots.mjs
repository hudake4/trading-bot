// Captures every page at the viewports and themes in docs/UI-CONVENTIONS.md (dark is the default theme).
// Usage: with `npm run dev` running (demo mode is fine), run `node scripts/screenshots.mjs`.
// Output goes to test-evidence/ (git-ignored). It seeds a small watchlist and one dry run through the API.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "test-evidence";
mkdirSync(OUT, { recursive: true });

async function api(path, method = "GET", body) {
  const res = await fetch(`${BASE}/api${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok && res.status !== 409) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

// Seed: a few symbols, one pinned to a different strategy, then a dry run for the Activity page.
await api("/data/reset", "POST");
for (const [symbol, strategyId] of [["AAPL", null], ["MSFT", null], ["NVDA", "momentum"], ["SPY", "buyhold"], ["TSLA", "meanrev"]]) {
  await api("/symbols", "POST", { symbol, strategyId });
}
await api("/bot/run", "POST", { dryRun: true });

const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const pages = [
  ["dashboard", "/", async (p) => p.waitForSelector("[data-testid=account-card]")],
  ["strategies", "/strategies", async (p) => p.waitForSelector("[data-testid=strategy-list]")],
  ["watchlist", "/watchlist", async (p) => { await p.waitForSelector("[data-testid=watchlist-table]"); await p.waitForFunction(() => document.querySelectorAll("[data-testid^=watch-row-] .animate-pulse").length === 0, null, { timeout: 30000 }); }],
  ["analyze", "/analyze?symbol=AAPL", async (p) => p.waitForSelector("[data-testid=analyze-result]", { timeout: 30000 })],
  ["backtest", "/backtest?symbol=AAPL", async (p) => { await p.click("[data-testid=bt-run]"); await p.waitForSelector("[data-testid=bt-result]", { timeout: 30000 }); }],
  ["activity", "/activity", async (p) => p.waitForSelector("[data-testid=run-card]")],
  ["settings", "/settings", async (p) => p.waitForSelector("[data-testid=connection-card]")],
];

const browser = await chromium.launch();
for (const [vpName, viewport] of Object.entries(viewports)) {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript((t) => { try { localStorage.setItem("tradedesk-theme", t); } catch {} }, theme);
    const page = await context.newPage();
    const problems = [];
    page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    for (const [name, path, ready] of pages) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await ready(page);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      await page.screenshot({ path: `${OUT}/${name}-${vpName}-${theme}.png`, fullPage: true });
      console.log(`${name} ${vpName} ${theme}${overflow ? "  [PAGE-LEVEL HORIZONTAL OVERFLOW]" : ""}`);
    }
    if (problems.length) console.log(`  problems (${vpName}/${theme}):\n  ` + [...new Set(problems)].join("\n  "));
    await context.close();
  }
}
await browser.close();
