"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UsageDailyPoint } from "@/lib/usage/view-model";

export default function UsageDailyCostChart({
  points,
}: {
  points: UsageDailyPoint[];
}) {
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
        <CardTitle className="text-sm">Daily cost</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="shortDay"
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickMargin={6}
              />
              <YAxis
                tickFormatter={(value) => {
                  const v = typeof value === "number" ? value : 0;
                  return v < 0.1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;
                }}
                tick={{ fontSize: 12, fill: "#64748b" }}
                width={56}
              />
              <Tooltip
                formatter={(value) => {
                  const v = typeof value === "number" ? value : 0;
                  return [
                    v < 0.1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`,
                    "Cost",
                  ];
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
                dataKey="costUsd"
                stroke="#0f172a"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
