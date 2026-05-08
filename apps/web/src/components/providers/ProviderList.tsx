"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      <Card className="rounded-2xl">
        <div className="flex items-center justify-between gap-4 border-b px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-[-0.02em]">
            AI 模型配置
            <Badge variant="secondary" className="ml-2">
              {providers.length}
            </Badge>
          </h2>
          <AddProviderDialog onSuccess={() => router.refresh()} />
        </div>

        {providers.length === 0 ? (
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <svg
                className="h-5 w-5 text-muted-foreground"
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
            <h3 className="text-base font-semibold tracking-[-0.03em]">
              尚未添加 AI 模型配置
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              添加 Anthropic、OpenAI 或其他 provider 的 API Key，让 AI 审查功能正常运行。
            </p>
          </CardContent>
        ) : (
          <div className="divide-y">
            {providers.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs ${PROVIDER_BADGE_CLASS[item.provider]}`}
                >
                  {PROVIDER_LABEL[item.provider]}
                </Badge>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.displayName}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.model}
                  </p>
                </div>

                <p className="shrink-0 font-mono text-xs text-muted-foreground">
                  {item.maskedKeySuffix ? `****${item.maskedKeySuffix}` : "—"}
                </p>

                <Badge
                  variant="outline"
                  className={
                    item.isActive
                      ? "shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "shrink-0 bg-muted text-muted-foreground"
                  }
                >
                  {item.isActive ? "启用中" : "未启用"}
                </Badge>

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
                    className="text-destructive hover:bg-destructive/10"
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
      </Card>

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
              className="bg-destructive hover:bg-destructive/90"
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
