"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardUsageOverview } from "@/lib/dashboard/types";
import { formatCompactNumber, formatLatencyMs } from "@/lib/usage/format";

export default function DashboardUsageOverview({
  usage,
}: {
  usage: DashboardUsageOverview;
}) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ w: 0, h: 0 });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;
    const el = containerRef.current;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setChartSize((prev) =>
          prev.w === width && prev.h === height ? prev : { w: width, h: height }
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  if (usage.totalCalls === 0 && usage.dailyPoints.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No usage data yet. AI call metrics will appear here after your first review.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-0">
        <CardTitle className="text-base tracking-[-0.03em]">
          Usage overview
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Last 7 days AI call activity
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div ref={containerRef} className="h-48 w-full">
            {mounted && chartSize.w > 0 ? (
              <LineChart
                width={chartSize.w}
                height={chartSize.h}
                data={usage.dailyPoints}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickMargin={6}
                />
                <YAxis
                  tickFormatter={(value) => {
                    const v = typeof value === "number" ? value : 0;
                    return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
                  }}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => {
                    const v = typeof value === "number" ? value : 0;
                    return [v.toLocaleString(), "Calls"];
                  }}
                  labelClassName="text-xs text-slate-500"
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#e5e7eb",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            ) : (
              <div className="h-48 w-full" />
            )}
          </div>
          <div className="flex flex-row gap-6 lg:flex-col lg:justify-center">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Total calls
              </div>
              <div className="mt-0.5 text-2xl font-semibold tracking-tight">
                {formatCompactNumber(usage.totalCalls)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Avg latency
              </div>
              <div className="mt-0.5 text-2xl font-semibold tracking-tight">
                {formatLatencyMs(usage.avgLatencyMs)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
