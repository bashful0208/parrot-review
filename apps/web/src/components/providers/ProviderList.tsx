"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AddProviderDialog from "./AddProviderDialog";

type ProviderType = "anthropic" | "openai" | "alibaba" | "custom";

interface ProviderItem {
  id: string;
  provider: ProviderType;
  displayName: string;
  model: string;
  baseUrl: string | null;
  maskedKeySuffix: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  providers: ProviderItem[];
}

const PROVIDER_BADGE_CLASS: Record<ProviderType, string> = {
  anthropic: "border-violet-200 bg-violet-50 text-violet-700",
  openai: "border-emerald-200 bg-emerald-50 text-emerald-700",
  alibaba: "border-orange-200 bg-orange-50 text-orange-700",
  custom: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const PROVIDER_LABEL: Record<ProviderType, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  alibaba: "Alibaba",
  custom: "Custom",
};

export default function ProviderList({ providers }: Props) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ProviderItem | null>(null);

  async function handleActivate(id: string) {
    await fetch(`/api/providers/${id}/activate`, { method: "PATCH" });
    router.refresh();
  }

  async function handleDelete(item: ProviderItem) {
    if (item.isActive) {
      setConfirmDeleteItem(item);
      return;
    }
    await doDelete(item.id);
  }

  async function doDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/providers/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className="rounded-[20px] border border-slate-200/80 bg-white/92 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-[-0.02em] text-zinc-950">
            AI 模型配置
            <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
              {providers.length}
            </span>
          </h2>
          <AddProviderDialog onSuccess={() => router.refresh()} />
        </div>

        {providers.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
              <svg
                className="h-5 w-5 text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.8"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15m-6.75-2.386v3.636m0 0a2.25 2.25 0 003 2.122 2.25 2.25 0 003-2.122"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold tracking-[-0.03em] text-zinc-950">
              尚未添加 AI 模型配置
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
              添加 Anthropic、OpenAI 或其他 provider 的 API Key，让 AI 审查功能正常运行。
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {providers.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 px-5 py-4"
              >
                {/* Provider badge */}
                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs ${PROVIDER_BADGE_CLASS[item.provider]}`}
                >
                  {PROVIDER_LABEL[item.provider]}
                </Badge>

                {/* Name + model */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{item.displayName}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-400">{item.model}</p>
                </div>

                {/* Masked key */}
                <p className="shrink-0 font-mono text-xs text-zinc-400">
                  {item.maskedKeySuffix ? `****${item.maskedKeySuffix}` : "—"}
                </p>

                {/* Active badge */}
                <Badge
                  variant="outline"
                  className={
                    item.isActive
                      ? "shrink-0 border-emerald-200 bg-emerald-50 text-xs text-emerald-700"
                      : "shrink-0 border-zinc-200 bg-zinc-100 text-xs text-zinc-500"
                  }
                >
                  {item.isActive ? "启用中" : "未启用"}
                </Badge>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {!item.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleActivate(item.id)}
                    >
                      设为默认
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                    disabled={deletingId === item.id}
                    onClick={() => void handleDelete(item)}
                  >
                    {deletingId === item.id ? "删除中…" : "删除"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirm delete active provider */}
      <AlertDialog
        open={confirmDeleteItem !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteItem(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除启用中的配置？</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDeleteItem?.displayName}" 当前正在使用中。删除后 AI 审查功能将无法正常工作，直到设置新的默认配置。确定继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteItem(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                const id = confirmDeleteItem!.id;
                setConfirmDeleteItem(null);
                void doDelete(id);
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
