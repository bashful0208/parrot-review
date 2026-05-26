"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GitBranch,
  GitFork,
  Globe,
  Loader2,
  RotateCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { describeWebhookError } from "@/lib/repositories/webhook-error-labels";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { RepositoryDetailItem } from "@/lib/repositories/detail-view-model";

function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  if (provider === "github") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    );
  }
  if (provider === "gitee") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296z" />
      </svg>
    );
  }
  return <GitBranch className={className} />;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? (
        <Check className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function RepositoryDetail({
  repository,
}: {
  repository: RepositoryDetailItem;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [webhook, setWebhook] = useState(repository.webhook);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  async function handleRetryWebhook() {
    setRetrying(true);
    setRetryMessage(null);
    try {
      const res = await fetch(`/api/repositories/${repository.id}/webhook/retry`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        webhookRegistration?: {
          status: "auto" | "manual";
          hookId?: string;
          errorCode?: string;
          errorMessage?: string;
        };
      };
      if (!data.ok) {
        setRetryMessage(data.error ?? "重试失败");
        return;
      }
      const reg = data.webhookRegistration!;
      if (reg.status === "auto") {
        setWebhook({ mode: "auto", hookId: reg.hookId ?? null, lastError: null });
        setRetryMessage("Webhook 已自动注册");
      } else {
        setWebhook({
          mode: "manual",
          hookId: null,
          lastError:
            reg.errorCode && reg.errorMessage
              ? { code: reg.errorCode, message: reg.errorMessage }
              : null,
        });
        setRetryMessage(
          describeWebhookError(reg.errorCode, reg.errorMessage, repository.provider)
        );
      }
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : "网络错误");
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/repositories/${repository.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        alert(data.error ?? "Delete failed, please try again");
        return;
      }
      router.refresh();
      router.push("/repositories");
    } catch {
      alert("Network error, please try again");
    } finally {
      setDeleting(false);
    }
  }

  const isActive = repository.status === "active";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        <Link
          href="/repositories"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Repositories
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="font-medium text-foreground">
          {repository.fullName}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-card shadow-sm">
            <ProviderIcon
              provider={repository.provider}
              className="h-5 w-5 text-primary"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-[-0.03em]">
                {repository.fullName}
              </h1>
              <Badge
                variant={isActive ? "default" : "secondary"}
                className="capitalize"
              >
                {repository.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {repository.provider} &middot; Connected {repository.createdAtLabel}
            </p>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="shrink-0">
              <Trash2 className="size-3.5" />
              Delete Repository
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/60">
              <Trash2 className="size-5 text-red-500" />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Repository?</AlertDialogTitle>
              <AlertDialogDescription>
                Repository{" "}
                <span className="font-medium">{repository.fullName}</span>{" "}
                will be deactivated and related webhooks will stop receiving
                events. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Separator />

      {/* Stats KPI row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-3 p-4">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                isActive
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Status
              </p>
              <p className="text-sm font-semibold capitalize">{repository.status}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Provider
              </p>
              <p className="text-sm font-semibold capitalize">
                {repository.provider}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <GitFork className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Default Branch
              </p>
              <p className="truncate text-sm font-semibold">
                {repository.defaultBranch}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Connected Since
              </p>
              <p className="text-sm font-semibold">
                {repository.createdAtLabel}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info + Webhook cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Basic Information */}
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold tracking-[-0.02em]">
              Basic Information
            </h2>
            <Separator className="my-4" />
            <dl className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Full Name
                  </dt>
                  <dd className="truncate text-sm font-medium">
                    {repository.fullName}
                  </dd>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Provider
                  </dt>
                  <dd>
                    <Badge variant="outline">{repository.provider}</Badge>
                  </dd>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <GitFork className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Default Branch
                  </dt>
                  <dd className="text-sm font-medium">
                    {repository.defaultBranch}
                  </dd>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Connected At
                  </dt>
                  <dd className="text-sm font-medium">
                    {repository.createdAtLabel}
                  </dd>
                </div>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold tracking-[-0.02em]">
              Webhook Configuration
            </h2>
            <Separator className="my-4" />

            <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Webhook URL
                </p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Add this URL in your provider&apos;s webhook settings to
                  receive pull request events.
                </p>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate rounded-lg border bg-muted px-3 py-2 font-mono text-xs">
                    {repository.webhookUrl}
                  </div>
                  <CopyButton value={repository.webhookUrl} />
                </div>
              </div>

              <Separator />

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Webhook Secret
                </p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Use this secret to verify that incoming webhooks are genuine.
                  Keep it secure.
                </p>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate rounded-lg border bg-muted px-3 py-2 font-mono text-xs">
                    {showSecret
                      ? repository.webhookSecret
                      : "•".repeat(24)}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSecret((v) => !v)}
                  >
                    {showSecret ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                    {showSecret ? "Hide" : "Show"}
                  </Button>
                  <CopyButton value={repository.webhookSecret} />
                </div>
              </div>

              {webhook.mode === "auto" ? (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-emerald-800">
                      Webhook 已自动注册
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-600">
                      Hook ID: <span className="font-mono">{webhook.hookId ?? "—"}</span>。如果在 Git 平台手动删除了 webhook，可点重试重新注册。
                    </p>
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleRetryWebhook()}
                        disabled={retrying}
                      >
                        {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                        {retrying ? "Retrying…" : "重新注册"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-800">
                      Webhook 自动注册未完成
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      {describeWebhookError(
                        webhook.lastError?.code,
                        webhook.lastError?.message,
                        repository.provider
                      )}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleRetryWebhook()}
                        disabled={retrying}
                      >
                        {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                        {retrying ? "Retrying…" : "重试自动注册"}
                      </Button>
                      {retryMessage && (
                        <span className="text-xs text-amber-700">{retryMessage}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
