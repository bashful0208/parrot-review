export type UsageRangeKey = "7d" | "30d" | "90d";

export function parseUsageRangeDays(input: string | undefined | null): number {
  switch (input) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    default:
      return 7;
  }
}

export function rangeKeyFromDays(days: number): UsageRangeKey {
  if (days >= 90) return "90d";
  if (days >= 30) return "30d";
  return "7d";
}

const MICRO_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const NORMAL_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$0.00";
  // For sub-dime amounts keep 4 decimals so single-digit-cent costs stay visible
  if (amount > 0 && amount < 0.1) return MICRO_USD.format(amount);
  return NORMAL_USD.format(amount);
}

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1_000_000) {
    const k = n / 1000;
    return `${stripTrailingZero(k.toFixed(1))}k`;
  }
  if (abs < 1_000_000_000) {
    const m = n / 1_000_000;
    return `${stripTrailingZero(m.toFixed(1))}M`;
  }
  const b = n / 1_000_000_000;
  return `${stripTrailingZero(b.toFixed(1))}B`;
}

function stripTrailingZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatLatencyMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const s = ms / 1000;
    return `${stripTrailingZero(s.toFixed(1))}s`;
  }
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

export function formatRelativeTime(then: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 30_000) return "just now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  const pct = (numerator / denominator) * 100;
  return `${pct.toFixed(1)}%`;
}
