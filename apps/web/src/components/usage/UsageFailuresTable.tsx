import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  return ERROR_TONES[code] ?? "bg-accent text-accent-foreground";
}

export default function UsageFailuresTable({
  rows,
}: {
  rows: UsageFailureRow[];
}) {
  if (rows.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-6 text-sm text-muted-foreground">
          No failed AI calls in this range — clean slate.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <h2 className="text-sm font-semibold">Recent failures</h2>
        <span className="text-xs text-muted-foreground">{rows.length} shown</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Provider / model</TableHead>
              <TableHead>Error</TableHead>
              <TableHead className="text-right">Latency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">
                  {r.occurredAtLabel}
                </TableCell>
                <TableCell>{r.taskTypeLabel}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.providerLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.modelLabel}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={badgeTone(r.errorCodeLabel)} variant="secondary">
                    {r.errorCodeLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.latencyLabel}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
