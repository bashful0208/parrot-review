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
import type { UsageDailyPoint } from "@/lib/usage/view-model";

export default function UsageDailyCallsChart({
  points,
}: {
  points: UsageDailyPoint[];
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

  if (points.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No usage in the selected range yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-sm">Daily calls</CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="h-64 w-full">
          {mounted && chartSize.w > 0 ? (
            <LineChart
              width={chartSize.w}
              height={chartSize.h}
              data={points}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="shortDay"
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
                dataKey="calls"
                stroke="#0f172a"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          ) : (
            <div className="h-64 w-full" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
