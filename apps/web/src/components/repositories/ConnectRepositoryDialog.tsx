"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, GitBranch, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ProviderRepoItem {
  providerRepoId: string;
  name: string;
  fullName: string;
  ownerNamespace: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  description: string | null;
  alreadyConnected: boolean;
}

interface WebhookInfo {
  webhookUrl: string;
  webhookSecret: string;
  repositoryId: string;
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Credentials" },
    { n: 2, label: "Select Repo" },
    { n: 3, label: "Webhook" },
  ] as const;

  return (
    <div className="flex items-center gap-0">
      {steps.map(({ n, label }, i) => (
        <div key={n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                n < current && "bg-emerald-500 text-white",
                n === current && "bg-zinc-950 text-white",
                n > current && "bg-slate-100 text-slate-400"
              )}
            >
              {n < current ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <span
              className={cn(
                "text-[11px] font-medium",
                n === current ? "text-zinc-950" : "text-zinc-400"
              )}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "mx-3 mb-5 h-px w-10",
                n < current ? "bg-emerald-400" : "bg-slate-200"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void handleCopy()}
      className="shrink-0 gap-1.5"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-emerald-600">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </Button>
  );
}

interface ConnectRepositoryDialogProps {
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost";
  triggerSize?: "default" | "sm" | "lg";
  triggerClassName?: string;
}

export default function ConnectRepositoryDialog({
  triggerLabel = "+ Connect",
  triggerVariant = "default",
  triggerSize = "default",
  triggerClassName,
}: ConnectRepositoryDialogProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [token, setToken] = useState("");
  const [repoList, setRepoList] = useState<ProviderRepoItem[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<ProviderRepoItem | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset state when closing
      setTimeout(() => {
        setStep(1);
        setToken("");
        setRepoList([]);
        setSelectedRepo(null);
        setWebhookInfo(null);
        setError("");
      }, 300);
    }
  }

  async function handleVerify() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/repositories/verify-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { ok: boolean; repositories?: ProviderRepoItem[]; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Verification failed");
        return;
      }
      setRepoList(data.repositories ?? []);
      setStep(2);
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!selectedRepo) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerRepoId: selectedRepo.providerRepoId,
          name: selectedRepo.name,
          fullName: selectedRepo.fullName,
          ownerNamespace: selectedRepo.ownerNamespace,
          defaultBranch: selectedRepo.defaultBranch,
          token,
        }),
      });
      const data = await res.json() as {
        ok: boolean;
        repositoryId?: string;
        webhookUrl?: string;
        webhookSecret?: string;
        error?: string;
      };
      if (!data.ok) {
        setError(data.error ?? "Failed to connect repository");
        return;
      }
      setWebhookInfo({
        webhookUrl: data.webhookUrl!,
        webhookSecret: data.webhookSecret!,
        repositoryId: data.repositoryId!,
      });
      setStep(3);
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleDone() {
    setOpen(false);
    router.refresh();
  }

  const stepTitles = {
    1: "Connect a Repository",
    2: "Select a Repository",
    3: "Configure Webhook",
  };

  const stepDescriptions = {
    1: "Enter a GitHub Personal Access Token to fetch your repositories.",
    2: `${repoList.length} repositories found. Select one to connect.`,
    3: `${selectedRepo?.fullName ?? "Repository"} connected. Add the webhook in GitHub to receive review events.`,
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[55rem] gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 space-y-3">
          <div className="flex justify-center">
            <StepIndicator current={step} />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-zinc-950">
              {stepTitles[step]}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-zinc-500">
              {stepDescriptions[step]}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="min-h-[320px] px-6 py-5">
          {/* Step 1 — Credentials */}
          {step === 1 && (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  GitHub Personal Access Token
                </label>
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && token.trim()) void handleVerify();
                  }}
                  className="h-10 font-mono text-sm"
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Requires a Classic PAT with{" "}
                  <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono">repo</code> scope,
                  or a fine-grained PAT with repository read access.
                </p>
              </div>
            </div>
          )}

          {/* Step 2 — Select Repo */}
          {step === 2 && (
            <div className="space-y-3">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <ScrollArea className="h-72 pr-3">
                <div className="space-y-1.5">
                  {repoList.map((repo) => {
                    const isSelected = selectedRepo?.providerRepoId === repo.providerRepoId;
                    return (
                      <button
                        key={repo.providerRepoId}
                        type="button"
                        disabled={repo.alreadyConnected}
                        onClick={() => !repo.alreadyConnected && setSelectedRepo(repo)}
                        className={cn(
                          "w-full rounded-xl border px-3.5 py-2.5 text-left transition-all",
                          repo.alreadyConnected &&
                            "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50",
                          !repo.alreadyConnected &&
                            !isSelected &&
                            "border-slate-200 bg-white hover:border-zinc-300 hover:bg-slate-50",
                          isSelected &&
                            "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <GitBranch className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            <span className="truncate text-sm font-medium text-zinc-900">
                              {repo.fullName}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {repo.alreadyConnected && (
                              <Badge variant="secondary" className="text-[11px]">
                                Connected
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px]",
                                repo.isPrivate
                                  ? "border-zinc-200 text-zinc-500"
                                  : "border-sky-200 bg-sky-50 text-sky-700"
                              )}
                            >
                              {repo.isPrivate ? "Private" : "Public"}
                            </Badge>
                          </div>
                        </div>
                        {repo.description && (
                          <p className="mt-1 truncate text-xs text-zinc-400">
                            {repo.description}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Step 3 — Webhook */}
          {step === 3 && webhookInfo && (
            <div className="space-y-5">
              <ol className="list-decimal pl-4 space-y-1 text-sm text-zinc-500">
                <li>Go to your repository on GitHub → Settings → Webhooks → Add webhook</li>
                <li>
                  Set Content type to{" "}
                  <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">
                    application/json
                  </code>
                </li>
                <li>
                  Under events, select <strong className="text-zinc-700">Pull requests</strong>
                </li>
                <li>Paste the URL and secret below</li>
              </ol>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Webhook URL
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={webhookInfo.webhookUrl}
                      className="h-9 flex-1 bg-zinc-50 font-mono text-xs text-zinc-700"
                    />
                    <CopyButton text={webhookInfo.webhookUrl} />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Webhook Secret
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={webhookInfo.webhookSecret}
                      className="h-9 flex-1 bg-zinc-50 font-mono text-xs text-zinc-700"
                    />
                    <CopyButton text={webhookInfo.webhookSecret} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          {step === 1 && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!token.trim() || loading}
                onClick={() => void handleVerify()}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify Token"
                )}
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep(1);
                  setError("");
                }}
              >
                Back
              </Button>
              <Button
                size="sm"
                disabled={!selectedRepo || loading}
                onClick={() => void handleConnect()}
                className="min-w-[8rem]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Connect Repository"
                )}
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep(2);
                  setError("");
                }}
              >
                Back
              </Button>
              <Button size="sm" onClick={handleDone} className="min-w-[6rem]">
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
