"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Copy, GitBranch, Loader2, Search, Webhook, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

const DIALOG_DIMENSIONS = {
  width: "min(52rem, calc(100vw - 2rem))",
  maxWidth: "calc(100vw - 2rem)",
  height: "min(620px, 85vh)",
  maxHeight: "85vh",
} as const;

const PROVIDER_SVG_PATHS = {
  github:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  gitlab:
    "M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 00-.867 0L1.386 9.45.044 13.587a.924.924 0 00.331 1.03L12 23.054l11.625-8.436a.92.92 0 00.33-1.031",
  gitee:
    "M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296z",
} as const;

const STEPS = [
  { n: 1 as const, label: "Credentials",   desc: "Choose provider & authenticate" },
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
    1: "Choose your Git provider and enter a Personal Access Token to list your repositories.",
    2: "Pick the repository you want Parrot Review to monitor for pull request events.",
    3: "Add the webhook in your Git provider so pull request events are forwarded to Parrot Review.",
  };

  return (
    <div className="hidden md:flex w-52 shrink-0 flex-col bg-zinc-950 px-5 py-7 border-r border-white/5">
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
  children?: React.ReactNode;
}

export default function ConnectRepositoryDialog({
  triggerLabel = "+ Connect",
  triggerVariant = "default",
  triggerSize = "default",
  triggerClassName,
  children,
}: ConnectRepositoryDialogProps) {
  let router: ReturnType<typeof useRouter>;
  try {
    router = useRouter();
  } catch {
    // Fallback for non-client contexts (e.g., static rendering in tests)
    router = {
      refresh: () => {},
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      prefetch: () => {},
    } as unknown as ReturnType<typeof useRouter>;
  }

  type SupportedProvider = "github" | "gitee";

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [provider, setProvider] = useState<SupportedProvider>("github");
  const [token, setToken] = useState("");
  const [repoList, setRepoList] = useState<ProviderRepoItem[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<ProviderRepoItem | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [repoSearch, setRepoSearch] = useState("");

  const filteredRepos = (() => {
    const q = repoSearch.trim().toLowerCase();
    if (!q) return repoList;
    return repoList.filter((r) =>
      r.fullName.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.description?.toLowerCase().includes(q) ?? false)
    );
  })();

  const tokenPlaceholder = provider === "gitee" ? "gitee-pat-xxxxxxxxxxxxxxxxxxxx" : "ghp_xxxxxxxxxxxxxxxxxxxx";
  const tokenHelpUrl = provider === "gitee" ? "https://gitee.com/profile/personal_access_tokens" : "https://github.com/settings/tokens/new";
  const tokenHelpLabel = provider === "gitee" ? "Generate a new token on Gitee →" : "Generate a new token on GitHub →";
  const setupHostLabel = provider === "gitee" ? "Gitee" : "GitHub";
  const setupEventLabel = provider === "gitee" ? "Pull Request" : "Pull requests";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTimeout(() => {
        setStep(1); setProvider("github"); setToken(""); setRepoList([]);
        setSelectedRepo(null); setWebhookInfo(null); setError(""); setRepoSearch("");
      }, 300);
    }
  }

  function handleProviderChange(next: SupportedProvider) {
    if (next === provider) return;
    setProvider(next);
    setToken("");
    setRepoList([]);
    setSelectedRepo(null);
    setError("");
    setRepoSearch("");
  }

  async function handleVerify() {
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/repositories/verify-credential", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, provider }),
      });
      const data = await res.json() as { ok: boolean; repositories?: ProviderRepoItem[]; error?: string };
      if (!data.ok) { setError(data.error ?? "Verification failed"); return; }
      setRepoList(data.repositories ?? []);
      setRepoSearch("");
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
          provider,
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
          {children ?? triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent
        className="gap-0 p-0 overflow-hidden"
        style={DIALOG_DIMENSIONS}
      >
        <div className="flex w-full h-full">

          {/* Left sidebar */}
          <Sidebar current={step} />

          {/* Right content */}
          <div className="flex flex-1 flex-col min-w-0">

            {/* Body */}
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden px-6 py-7 md:px-7 md:py-8 md:pt-10">

              {/* Step 1 */}
              {step === 1 && (
                <div className="flex h-full flex-col justify-center max-w-md">
                  {error && (
                    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                  )}
                  <div className="space-y-6">
                    {/* Provider selection */}
                    <div>
                      <label className="mb-2.5 block text-sm font-medium text-zinc-700">
                        Git Provider
                      </label>
                      <div className="grid grid-cols-3 gap-2.5">
                        {/* GitHub */}
                        <button
                          type="button"
                          onClick={() => handleProviderChange("github")}
                          className={cn(
                            "relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-3.5 cursor-pointer transition-all",
                            provider === "github"
                              ? "border-zinc-950 bg-zinc-50"
                              : "border-slate-200 bg-white hover:border-zinc-400"
                          )}
                        >
                          <svg viewBox="0 0 24 24" className={cn("h-6 w-6", provider === "github" ? "fill-zinc-900" : "fill-zinc-500")} xmlns="http://www.w3.org/2000/svg">
                            <path d={PROVIDER_SVG_PATHS.github} />
                          </svg>
                          <span className={cn("text-xs font-semibold", provider === "github" ? "text-zinc-900" : "text-zinc-600")}>GitHub</span>
                          {provider === "github" && (
                            <div className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950">
                              <Check className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                        </button>

                        {/* GitLab — coming soon */}
                        <div className="relative flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-3.5 cursor-not-allowed opacity-60">
                          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-slate-400" xmlns="http://www.w3.org/2000/svg">
                            <path d={PROVIDER_SVG_PATHS.gitlab} />
                          </svg>
                          <span className="text-xs font-semibold text-slate-400">GitLab</span>
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            Coming soon
                          </span>
                        </div>

                        {/* Gitee */}
                        <button
                          type="button"
                          onClick={() => handleProviderChange("gitee")}
                          className={cn(
                            "relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-3.5 cursor-pointer transition-all",
                            provider === "gitee"
                              ? "border-zinc-950 bg-zinc-50"
                              : "border-slate-200 bg-white hover:border-zinc-400"
                          )}
                        >
                          <svg viewBox="0 0 24 24" className={cn("h-6 w-6", provider === "gitee" ? "fill-[#c71d23]" : "fill-zinc-500")} xmlns="http://www.w3.org/2000/svg">
                            <path d={PROVIDER_SVG_PATHS.gitee} />
                          </svg>
                          <span className={cn("text-xs font-semibold", provider === "gitee" ? "text-zinc-900" : "text-zinc-600")}>Gitee</span>
                          {provider === "gitee" && (
                            <div className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950">
                              <Check className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* PAT input */}
                    <div>
                      <label className="mb-2 block text-sm font-medium text-zinc-700">
                        Personal Access Token
                      </label>
                      <Input
                        type="password"
                        placeholder={tokenPlaceholder}
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && token.trim()) void handleVerify(); }}
                        className="h-11 font-mono text-sm"
                      />
                      {provider === "github" ? (
                        <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
                          Requires a Classic PAT with{" "}
                          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-600">repo</code>{" "}
                          scope, or a fine-grained PAT with repository read access.
                        </p>
                      ) : (
                        <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
                          Requires a Gitee PAT with{" "}
                          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-600">projects</code>{" "}
                          and{" "}
                          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-600">pull_requests</code>{" "}
                          scopes (notes also recommended for posting reviews).
                        </p>
                      )}
                    </div>
                    <a
                      href={tokenHelpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
                    >
                      {tokenHelpLabel}
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
                  <div className="mb-3 flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                      <Input
                        type="text"
                        value={repoSearch}
                        onChange={(e) => setRepoSearch(e.target.value)}
                        placeholder="Filter by name, owner, or description"
                        className="h-9 pl-9 pr-9 text-sm"
                      />
                      {repoSearch && (
                        <button
                          type="button"
                          onClick={() => setRepoSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                          aria-label="Clear filter"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                      {repoSearch ? (
                        <>
                          <b className="font-semibold text-zinc-900">{filteredRepos.length}</b>
                          <span className="mx-0.5">/</span>
                          <b className="font-semibold text-zinc-900">{repoList.length}</b>
                        </>
                      ) : (
                        <>
                          <b className="font-semibold text-zinc-900">{repoList.length}</b>
                          <span> repos</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="relative flex-1 min-h-0">
                    <div className="absolute inset-0 overflow-y-auto pr-1">
                      {filteredRepos.length === 0 ? (
                        <div className="flex h-full items-center justify-center py-16 text-center">
                          <div>
                            <Search className="mx-auto mb-3 h-6 w-6 text-zinc-300" />
                            <p className="text-sm font-medium text-zinc-600">No matches</p>
                            <p className="mt-1 text-xs text-zinc-400">Try a different search term.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 pb-1">
                          {filteredRepos.map((repo) => {
                            const isSelected = selectedRepo?.providerRepoId === repo.providerRepoId;
                            return (
                              <button
                                key={repo.providerRepoId}
                                type="button"
                                disabled={repo.alreadyConnected}
                                onClick={() => !repo.alreadyConnected && setSelectedRepo(repo)}
                                className={cn(
                                  "w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors duration-150",
                                  repo.alreadyConnected && "cursor-not-allowed border-slate-100 opacity-40",
                                  !repo.alreadyConnected && !isSelected && "border-slate-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                                  isSelected && "border-zinc-900 bg-zinc-950 text-white"
                                )}
                              >
                                <div className="flex min-w-0 items-center justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-2">
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
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-white to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-white to-transparent" />
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {step === 3 && webhookInfo && (
                <div className="flex h-full flex-col justify-center max-w-md">
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
                      <li>{setupHostLabel} repo → {provider === "gitee" ? "管理 → WebHooks" : "Settings → Webhooks → Add webhook"}</li>
                      <li>Paste URL and Secret above; set Content type to <code className="rounded bg-white px-1 py-0.5 border border-slate-200 font-mono">application/json</code></li>
                      <li>Under events, select <strong className="text-zinc-700">{setupEventLabel}</strong> only</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-3.5">
              <div className="min-w-0 flex-1">
                {step === 2 && selectedRepo && (
                  <div className="flex min-w-0 items-center gap-1.5 text-xs">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="truncate font-medium text-zinc-700">{selectedRepo.fullName}</span>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
