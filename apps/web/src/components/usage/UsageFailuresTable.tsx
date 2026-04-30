import { Badge } from "@/components/ui/badge";
import type { UsageFailureRow } from "@/lib/usage/view-model";

const ERROR_TONES: Record<string, string> = {
  rate_limit: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  auth: "bg-rose-100 text-rose-900 hover:bg-rose-100",
  quota: "bg-rose-100 text-rose-900 hover:bg-rose-100",
  timeout: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  network: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  bad_request: "bg-rose-100 text-rose-900 hover:bg-rose-100",
  server_error: "bg-rose-100 text-rose-900 hover:bg-rose-100",
  truncated: "bg-sky-100 text-sky-900 hover:bg-sky-100",
  parse_error: "bg-rose-100 text-rose-900 hover:bg-rose-100",
  validation_error: "bg-rose-100 text-rose-900 hover:bg-rose-100",
};

function badgeTone(code: string): string {
  return ERROR_TONES[code] ?? "bg-slate-100 text-slate-800 hover:bg-slate-100";
}

export default function UsageFailuresTable({
  rows,
}: {
  rows: UsageFailureRow[];
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No failed AI calls in this range — clean slate.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-900">Recent failures</h2>
        <span className="text-xs text-slate-500">{rows.length} shown</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">When</th>
              <th className="px-5 py-2.5 text-left font-medium">Task</th>
              <th className="px-5 py-2.5 text-left font-medium">Provider / model</th>
              <th className="px-5 py-2.5 text-left font-medium">Error</th>
              <th className="px-5 py-2.5 text-right font-medium">Latency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2.5 text-slate-600">{r.occurredAtLabel}</td>
                <td className="px-5 py-2.5">{r.taskTypeLabel}</td>
                <td className="px-5 py-2.5">
                  <div className="font-medium text-slate-900">{r.providerLabel}</div>
                  <div className="text-xs text-slate-500">{r.modelLabel}</div>
                </td>
                <td className="px-5 py-2.5">
                  <Badge className={badgeTone(r.errorCodeLabel)} variant="secondary">
                    {r.errorCodeLabel}
                  </Badge>
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">
                  {r.latencyLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
