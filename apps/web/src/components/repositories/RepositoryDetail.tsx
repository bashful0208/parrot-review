"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, GitBranch, Copy, Eye, EyeOff, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RepositoryDetailItem } from "@/lib/repositories/detail-view-model";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable (non-HTTPS or permissions denied)
      // value is visible in the field — user can copy manually
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "已复制" : "复制"}
    </Button>
  );
}

export default function RepositoryDetail({
  repository,
}: {
  repository: RepositoryDetailItem;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/repositories"
        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"
      >
        <ChevronLeft className="size-4" />
        返回仓库列表
      </Link>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <GitBranch className="size-5 text-indigo-500" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-zinc-950">
              {repository.fullName}
            </h1>
            <Badge
              variant="outline"
              className={
                repository.status === "active"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 bg-zinc-100 text-zinc-600"
              }
            >
              {repository.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            {repository.provider} · 接入于 {repository.createdAtLabel}
          </p>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: 基本信息 */}
        <section className="rounded-[20px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            基本信息
          </h2>
          <dl className="divide-y divide-slate-100">
            <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium text-zinc-400">完整名称</dt>
              <dd className="text-sm font-medium text-zinc-800">{repository.fullName}</dd>
            </div>
            <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium text-zinc-400">提供商</dt>
              <dd>
                <Badge variant="outline" className="text-xs text-zinc-500">
                  {repository.provider}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium text-zinc-400">默认分支</dt>
              <dd className="text-sm font-medium text-zinc-800">{repository.defaultBranch}</dd>
            </div>
            <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium text-zinc-400">接入时间</dt>
              <dd className="text-sm font-medium text-zinc-800">{repository.createdAtLabel}</dd>
            </div>
          </dl>
        </section>

        {/* Right: Webhook 配置 */}
        <section className="rounded-[20px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Webhook 配置
          </h2>
          <div className="space-y-4">
            {/* Webhook URL */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">Webhook URL</p>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-zinc-500">
                  {repository.webhookUrl}
                </div>
                <CopyButton value={repository.webhookUrl} />
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* Webhook Secret */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">Webhook Secret</p>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-zinc-500">
                  {showSecret ? repository.webhookSecret : "•".repeat(24)}
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
                  {showSecret ? "隐藏" : "显示"}
                </Button>
                <CopyButton value={repository.webhookSecret} />
              </div>
            </div>

            {/* Hint */}
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-medium text-emerald-700">Webhook 已激活</p>
                <p className="mt-0.5 text-xs text-emerald-600/70">
                  在 GitHub → Settings → Webhooks 中配置以上 URL 和 Secret
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
