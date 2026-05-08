import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  return STATUS_TONE[s] ?? "bg-accent text-accent-foreground";
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
      <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
        No webhook events in this range yet.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Sig</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Repo</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell
                  className="text-muted-foreground"
                  title={r.occurredAtFull}
                >
                  {r.occurredAtLabel}
                </TableCell>
                <TableCell>
                  <Badge className={providerTone(r.provider)}>
                    {r.provider}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{r.eventType}</TableCell>
                <TableCell>
                  {r.signatureValid ? (
                    <span className="text-emerald-600" aria-label="signature valid">
                      ✓
                    </span>
                  ) : (
                    <span className="text-destructive" aria-label="signature invalid">
                      ✗
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={statusTone(r.status)} variant="secondary">
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.repositoryFullName ?? "—"}
                </TableCell>
                <TableCell
                  className="font-mono text-xs text-muted-foreground"
                  title={r.deliveryIdFull ?? ""}
                >
                  {r.deliveryIdShort}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.payloadSizeLabel}
                </TableCell>
                <TableCell>
                  <Link
                    href={r.detailHref}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Detail →
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
