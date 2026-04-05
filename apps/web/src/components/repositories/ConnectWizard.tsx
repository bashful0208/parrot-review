"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

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
    <div className="mb-8 flex items-center gap-0">
      {steps.map(({ n, label }, i) => (
        <div key={n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                n < current
                  ? "bg-emerald-500 text-white"
                  : n === current
                  ? "bg-zinc-950 text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {n < current ? (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 stroke-white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                n
              )}
            </div>
            <span className={`text-xs font-medium ${n === current ? "text-zinc-950" : "text-zinc-400"}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-3 mb-5 h-px w-12 ${n < current ? "bg-emerald-400" : "bg-slate-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ConnectWizard() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [token, setToken] = useState("");
  const [repoList, setRepoList] = useState<ProviderRepoItem[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<ProviderRepoItem | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState<"url" | "secret" | null>(null);

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

  async function handleContinueToWebhook() {
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

  async function handleCopy(field: "url" | "secret") {
    const text = field === "url" ? webhookInfo?.webhookUrl : webhookInfo?.webhookSecret;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-white/92 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <StepIndicator current={step} />

      {/* Step 1 */}
      {step === 1 && (
        <div className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold tracking-[-0.03em] text-zinc-950">
            Enter GitHub credentials
          </h2>
          <p className="mb-6 text-sm leading-6 text-zinc-500">
            Provide a Personal Access Token with <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">repo</code> scope to list and connect repositories.
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Input
            label="GitHub Personal Access Token"
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && token.trim()) void handleVerify(); }}
          />

          <Button
            variant="primary"
            loading={loading}
            disabled={!token.trim()}
            onClick={() => void handleVerify()}
            className="w-full"
          >
            Verify &amp; Fetch Repositories
          </Button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold tracking-[-0.03em] text-zinc-950">
            Select a repository
          </h2>
          <p className="mb-6 text-sm leading-6 text-zinc-500">
            {repoList.length} repositories found. Select one to connect.
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-6 max-h-96 space-y-2 overflow-y-auto pr-1">
            {repoList.map((repo) => {
              const isSelected = selectedRepo?.providerRepoId === repo.providerRepoId;
              return (
                <button
                  key={repo.providerRepoId}
                  type="button"
                  disabled={repo.alreadyConnected}
                  onClick={() => !repo.alreadyConnected && setSelectedRepo(repo)}
                  className={`w-full rounded-[14px] border px-4 py-3 text-left transition-colors ${
                    repo.alreadyConnected
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50"
                      : isSelected
                      ? "border-zinc-950 bg-zinc-50 ring-2 ring-zinc-950"
                      : "border-slate-200 bg-slate-50/70 hover:border-zinc-300 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-zinc-950">{repo.fullName}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {repo.alreadyConnected && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Already connected
                        </span>
                      )}
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        repo.isPrivate
                          ? "border-zinc-200 bg-zinc-100 text-zinc-600"
                          : "border-sky-200 bg-sky-50 text-sky-700"
                      }`}>
                        {repo.isPrivate ? "Private" : "Public"}
                      </span>
                    </div>
                  </div>
                  {repo.description && (
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-1">{repo.description}</p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep(1); setError(""); }}>
              Back
            </Button>
            <Button
              variant="primary"
              loading={loading}
              disabled={!selectedRepo}
              onClick={() => void handleContinueToWebhook()}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && webhookInfo && (
        <div className="max-w-lg">
          <h2 className="mb-1 text-lg font-semibold tracking-[-0.03em] text-zinc-950">
            Configure webhook
          </h2>
          <p className="mb-2 text-sm leading-6 text-zinc-500">
            Repository <span className="font-medium text-zinc-800">{selectedRepo?.fullName}</span> has been connected.
            Add the webhook in GitHub to start receiving review triggers.
          </p>

          <ol className="mb-6 list-decimal pl-5 text-sm leading-6 text-zinc-500">
            <li>Go to your repository on GitHub → Settings → Webhooks → Add webhook</li>
            <li>Paste the URL and secret below</li>
            <li>Set Content type to <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">application/json</code></li>
            <li>Under events, select <strong className="text-zinc-700">Pull requests</strong></li>
          </ol>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Webhook URL</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={webhookInfo.webhookUrl}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 focus:outline-none"
                />
                <Button variant="outline" onClick={() => void handleCopy("url")} className="shrink-0 px-3 py-2 text-sm">
                  {copiedField === "url" ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Webhook Secret</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={webhookInfo.webhookSecret}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-700 focus:outline-none"
                />
                <Button variant="outline" onClick={() => void handleCopy("secret")} className="shrink-0 px-3 py-2 text-sm">
                  {copiedField === "secret" ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => { setStep(2); setError(""); }}>
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push("/repositories")}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
