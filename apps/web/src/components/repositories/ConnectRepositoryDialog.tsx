"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Circle, Copy, GitBranch, Loader2, Webhook } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
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

const STEPS = [
  { n: 1 as const, label: "Credentials",   desc: "Authenticate with GitHub" },
  { n: 2 as const, label: "Select Repo",   desc: "Choose a repository" },
  { n: 3 as const, label: "Webhook",       desc: "Set up event delivery" },
];

function Sidebar({ current }: { current: 1 | 2 | 3 }) {
  const titles = {
    1: "Connect a Repository",
    2: "Select a Repository",
    3: "Configure Webhook",
  };
  const hints = {
    1: "Enter a GitHub Personal Access Token with repo scope to list your repositories.",
    2: "Pick the repository you want Parrot Review to monitor for pull request events.",
    3: "Add the webhook in GitHub so pull request events are forwarded to Parrot Review.",
  };

  return (
    <div className="flex w-64 shrink-0 flex-col bg-zinc-950 px-7 py-8">
      {/* Brand mark */}
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <GitBranch className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-white">Parrot Review</span>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-0">
        {STEPS.map(({ n, label }, i) => {
          const done = n < current;
          const active = n === current;
          return (
            <div key={n} className="flex gap-3">
              {/* Line + circle column */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    done  && "border-emerald-500 bg-emerald-500 text-white",
                    active && "border-white bg-white text-zinc-950",
                    !done && !active && "border-zinc-700 bg-transparent text-zinc-500"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn("my-1 w-px flex-1", done ? "bg-emerald-500/50" : "bg-zinc-800")} style={{ minHeight: 28 }} />
                )}
              </div>
              {/* Label */}
              <div className="pb-7 pt-0.5">
                <p className={cn("text-sm font-medium leading-none", active ? "text-white" : done ? "text-emerald-400" : "text-zinc-500")}>
                  {label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current step info */}
      <div className="mt-auto">
        <p className="text-lg font-semibold leading-snug text-white">{titles[current]}</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{hints[current]}</p>
      </div>
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
    <Button variant="outline" size="default" onClick={() => void handleCopy()} className="shrink-0 w-20">
      {copied ? <><Check className="h-3.5 w-3.5 text-emerald-600" /><span className="text-emerald-600">Copied</span></> : <><Copy className="h-3.5 w-3.5" />Copy</>}
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
      setTimeout(() => {
        setStep(1); setToken(""); setRepoList([]);
        setSelectedRepo(null); setWebhookInfo(null); setError("");
      }, 300);
    }
  }

  async function handleVerify() {
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/repositories/verify-credential", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { ok: boolean; repositories?: ProviderRepoItem[]; error?: string };
      if (!data.ok) { setError(data.error ?? "Verification failed"); return; }
      setRepoList(data.repositories ?? []);
      setStep(2);
    } catch { setError("Network error, please try again"); }
    finally { setLoading(false); }
  }

  async function handleConnect() {
    if (!selectedRepo) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/repositories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerRepoId: selectedRepo.providerRepoId, name: selectedRepo.name,
          fullName: selectedRepo.fullName, ownerNamespace: selectedRepo.ownerNamespace,
          defaultBranch: selectedRepo.defaultBranch, token,
        }),
      });
      const data = await res.json() as { ok: boolean; repositoryId?: string; webhookUrl?: string; webhookSecret?: string; error?: string };
      if (!data.ok) { setError(data.error ?? "Failed to connect repository"); return; }
      setWebhookInfo({ webhookUrl: data.webhookUrl!, webhookSecret: data.webhookSecret!, repositoryId: data.repositoryId! });
      setStep(3);
    } catch { setError("Network error, please try again"); }
    finally { setLoading(false); }
  }

  function handleDone() { setOpen(false); router.refresh(); }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[49rem] gap-0 p-0 overflow-hidden">
        <div className="flex min-h-[480px]">

          {/* Left sidebar */}
          <Sidebar current={step} />

          {/* Right content */}
          <div className="flex flex-1 flex-col">

            {/* Body */}
            <div className="flex-1 px-8 py-8">

              {/* Step 1 */}
              {step === 1 && (
                <div className="flex h-full flex-col justify-center max-w-md">
                  {error && (
                    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                  )}
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-zinc-700">
                        Personal Access Token
                      </label>
                      <Input
                        type="password"
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && token.trim()) void handleVerify(); }}
                        className="h-11 font-mono text-sm"
                      />
                      <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
                        Requires a Classic PAT with{" "}
                        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-600">repo</code>{" "}
                        scope, or a fine-grained PAT with repository read access.
                      </p>
                    </div>
                    <a
                      href="https://github.com/settings/tokens/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
                    >
                      Generate a new token on GitHub →
                    </a>
                  </div>
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && (
                <div className="flex h-full flex-col">
                  {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                  )}
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm text-zinc-500">
                      <span className="font-medium text-zinc-900">{repoList.length}</span> repositories found
                    </p>
                    {selectedRepo && (
                      <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" />{selectedRepo.name}
                      </span>
                    )}
                  </div>
                  <ScrollArea className="flex-1 h-72 -mx-1 px-1">
                    <div className="space-y-1.5 pb-1">
                      {repoList.map((repo) => {
                        const isSelected = selectedRepo?.providerRepoId === repo.providerRepoId;
                        return (
                          <button
                            key={repo.providerRepoId}
                            type="button"
                            disabled={repo.alreadyConnected}
                            onClick={() => !repo.alreadyConnected && setSelectedRepo(repo)}
                            className={cn(
                              "w-full rounded-xl border px-4 py-3 text-left transition-all duration-150",
                              repo.alreadyConnected && "cursor-not-allowed border-slate-100 opacity-40",
                              !repo.alreadyConnected && !isSelected && "border-slate-200 bg-white hover:border-zinc-300 hover:shadow-sm",
                              isSelected && "border-zinc-900 bg-zinc-950 text-white shadow-sm"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <GitBranch className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-zinc-300" : "text-zinc-400")} />
                                <span className={cn("truncate text-sm font-medium", isSelected ? "text-white" : "text-zinc-900")}>
                                  {repo.fullName}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {repo.alreadyConnected && (
                                  <Badge variant="secondary" className="text-[11px]">Connected</Badge>
                                )}
                                <span className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium border",
                                  isSelected
                                    ? "border-zinc-700 bg-zinc-800 text-zinc-300"
                                    : repo.isPrivate
                                    ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                                    : "border-sky-200 bg-sky-50 text-sky-700"
                                )}>
                                  {repo.isPrivate ? "Private" : "Public"}
                                </span>
                              </div>
                            </div>
                            {repo.description && (
                              <p className={cn("mt-1 truncate text-xs", isSelected ? "text-zinc-400" : "text-zinc-400")}>
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

              {/* Step 3 */}
              {step === 3 && webhookInfo && (
                <div className="flex h-full flex-col justify-center max-w-lg">
                  <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium text-emerald-800">Repository connected</p>
                      <p className="text-xs text-emerald-600 mt-0.5">{selectedRepo?.fullName}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">
                        Webhook URL
                      </label>
                      <div className="flex gap-2">
                        <Input readOnly value={webhookInfo.webhookUrl} className="h-9 flex-1 bg-zinc-50 font-mono text-xs" />
                        <CopyButton text={webhookInfo.webhookUrl} />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">
                        Webhook Secret
                      </label>
                      <div className="flex gap-2">
                        <Input readOnly value={webhookInfo.webhookSecret} className="h-9 flex-1 bg-zinc-50 font-mono text-xs" />
                        <CopyButton text={webhookInfo.webhookSecret} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Webhook className="h-3.5 w-3.5 text-zinc-500" />
                      <p className="text-xs font-semibold text-zinc-600">Setup instructions</p>
                    </div>
                    <ol className="list-decimal pl-4 space-y-1 text-xs leading-relaxed text-zinc-500">
                      <li>GitHub repo → Settings → Webhooks → Add webhook</li>
                      <li>Paste URL and Secret above; set Content type to <code className="rounded bg-white px-1 py-0.5 border border-slate-200 font-mono">application/json</code></li>
                      <li>Under events, select <strong className="text-zinc-700">Pull requests</strong> only</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-8 py-4">
              {step === 1 && (
                <>
                  <Button variant="outline" size="default" onClick={() => handleOpenChange(false)}>Cancel</Button>
                  <Button size="default" disabled={!token.trim() || loading} onClick={() => void handleVerify()} className="min-w-[7rem]">
                    {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Verifying…</> : "Verify Token"}
                  </Button>
                </>
              )}
              {step === 2 && (
                <>
                  <Button variant="outline" size="default" onClick={() => { setStep(1); setError(""); }}>Back</Button>
                  <Button size="default" disabled={!selectedRepo || loading} onClick={() => void handleConnect()} className="min-w-[8rem]">
                    {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Connecting…</> : "Connect Repository"}
                  </Button>
                </>
              )}
              {step === 3 && (
                <>
                  <Button variant="outline" size="default" onClick={() => { setStep(2); setError(""); }}>Back</Button>
                  <Button size="default" onClick={handleDone} className="min-w-[5rem]">Done</Button>
                </>
              )}
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
