import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
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
        className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Back to webhooks
      </Link>

      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {detail.meta.map((m) => (
              <div key={m.label} className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {m.label}
                </dt>
                <dd
                  className={[
                    "mt-1 break-words text-sm",
                    m.label === "Payload sha256" || m.label === "Delivery ID"
                      ? "font-mono text-xs"
                      : "",
                  ].join(" ")}
                >
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {detail.errorMessage ? (
        <Card className="rounded-2xl border-destructive/30 bg-destructive/10">
          <CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-destructive">
              Error
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-sm text-foreground">
              {detail.errorMessage}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Payload</h2>
          <span className="text-xs text-muted-foreground">
            {detail.payloadSizeLabel}
          </span>
        </div>
        <pre className="max-h-[640px] overflow-auto bg-zinc-950 px-5 py-4 text-xs leading-relaxed text-zinc-100">
          {detail.payloadJson}
        </pre>
      </Card>
    </div>
  );
}
