import Link from "next/link";

import type { WebhookDetailViewModel } from "@/lib/webhooks/view-model";

export default function WebhookDetail({
  detail,
}: {
  detail: WebhookDetailViewModel;
}) {
  return (
    <div className="space-y-5">
      <Link
        href={detail.backHref}
        className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to webhooks
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {detail.meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                {m.label}
              </dt>
              <dd
                className={[
                  "mt-1 break-words text-sm",
                  m.label === "Payload sha256" || m.label === "Delivery ID"
                    ? "font-mono text-xs text-slate-700"
                    : "text-slate-900",
                ].join(" ")}
              >
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {detail.errorMessage ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-rose-700">
            Error
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-sm text-rose-900">
            {detail.errorMessage}
          </pre>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Payload</h2>
          <span className="text-xs text-slate-500">{detail.payloadSizeLabel}</span>
        </header>
        <pre className="max-h-[640px] overflow-auto bg-slate-950 px-5 py-4 text-xs leading-relaxed text-slate-100">
          {detail.payloadJson}
        </pre>
      </section>
    </div>
  );
}
