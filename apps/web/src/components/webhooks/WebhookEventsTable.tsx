import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { WebhookListRow } from "@/lib/webhooks/view-model";

const PROVIDER_TONE: Record<string, string> = {
  github: "bg-slate-900 text-white hover:bg-slate-900",
  gitee: "bg-rose-700 text-white hover:bg-rose-700",
  gitlab: "bg-orange-600 text-white hover:bg-orange-600",
};

const STATUS_TONE: Record<string, string> = {
  received: "bg-sky-100 text-sky-900 hover:bg-sky-100",
  processed: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  failed: "bg-rose-100 text-rose-900 hover:bg-rose-100",
};

function statusTone(s: string): string {
  return STATUS_TONE[s] ?? "bg-slate-100 text-slate-800 hover:bg-slate-100";
}

function providerTone(p: string): string {
  return PROVIDER_TONE[p] ?? "bg-slate-700 text-white hover:bg-slate-700";
}

export default function WebhookEventsTable({
  rows,
}: {
  rows: WebhookListRow[];
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No webhook events in this range yet.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">When</th>
              <th className="px-5 py-2.5 text-left font-medium">Provider</th>
              <th className="px-5 py-2.5 text-left font-medium">Event</th>
              <th className="px-5 py-2.5 text-left font-medium">Sig</th>
              <th className="px-5 py-2.5 text-left font-medium">Status</th>
              <th className="px-5 py-2.5 text-left font-medium">Repo</th>
              <th className="px-5 py-2.5 text-left font-medium">Delivery</th>
              <th className="px-5 py-2.5 text-right font-medium">Size</th>
              <th className="px-5 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2.5 text-slate-600" title={r.occurredAtFull}>
                  {r.occurredAtLabel}
                </td>
                <td className="px-5 py-2.5">
                  <Badge className={providerTone(r.provider)} variant="secondary">
                    {r.provider}
                  </Badge>
                </td>
                <td className="px-5 py-2.5 font-medium text-slate-900">
                  {r.eventType}
                </td>
                <td className="px-5 py-2.5">
                  {r.signatureValid ? (
                    <span className="text-emerald-600" aria-label="signature valid">
                      ✓
                    </span>
                  ) : (
                    <span className="text-rose-600" aria-label="signature invalid">
                      ✗
                    </span>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  <Badge className={statusTone(r.status)} variant="secondary">
                    {r.status}
                  </Badge>
                </td>
                <td className="px-5 py-2.5 text-slate-600">
                  {r.repositoryFullName ?? "—"}
                </td>
                <td
                  className="px-5 py-2.5 font-mono text-xs text-slate-500"
                  title={r.deliveryIdFull ?? ""}
                >
                  {r.deliveryIdShort}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">
                  {r.payloadSizeLabel}
                </td>
                <td className="px-5 py-2.5">
                  <Link
                    href={r.detailHref}
                    className="text-xs font-medium text-slate-700 hover:text-slate-900"
                  >
                    Detail →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
