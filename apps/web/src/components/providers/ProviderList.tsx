"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cloud,
  Cpu,
  Globe,
  Sparkles,
  Trash2,
  CheckCircle2,
  Circle,
  Key,
  CpuIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

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

const PROVIDER_META: Record<
  ProviderType,
  { label: string; icon: typeof Cloud; badgeClass: string; iconClass: string }
> = {
  anthropic: {
    label: "Anthropic",
    icon: Sparkles,
    badgeClass: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400",
    iconClass: "text-violet-600 dark:text-violet-400",
  },
  openai: {
    label: "OpenAI",
    icon: Cpu,
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  alibaba: {
    label: "Alibaba",
    icon: Cloud,
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
    iconClass: "text-orange-600 dark:text-orange-400",
  },
  custom: {
    label: "Custom",
    icon: Globe,
    badgeClass: "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    iconClass: "text-zinc-500 dark:text-zinc-400",
  },
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
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Configured Providers</CardTitle>
            <Badge variant="secondary" className="font-mono text-xs">
              {providers.length}
            </Badge>
          </div>
          <AddProviderDialog onSuccess={() => router.refresh()} />
        </CardHeader>

        {providers.length === 0 ? (
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <CpuIcon className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">No AI providers configured</h3>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Add API keys for Anthropic, OpenAI, Alibaba, or a custom provider to enable AI-powered code reviews.
            </p>
            <div className="mt-6">
              <AddProviderDialog onSuccess={() => router.refresh()} />
            </div>
          </CardContent>
        ) : (
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((item) => {
              const meta = PROVIDER_META[item.provider];
              const Icon = meta.icon;
              return (
                <Card
                  key={item.id}
                  className={cn(
                    "group relative overflow-hidden transition-all duration-200",
                    "hover:shadow-md hover:-translate-y-0.5",
                    item.isActive && "ring-1 ring-primary/30 shadow-sm"
                  )}
                >
                  <CardContent className="p-3">
                    {/* Header row: brand badge + status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-md",
                            meta.iconClass,
                            "bg-current/10"
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider",
                            meta.iconClass
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {item.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                          <CheckCircle2 className="size-2.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Circle className="size-2.5" />
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="mt-2.5 space-y-1">
                      <p className="text-xs font-semibold leading-tight">{item.displayName}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {item.model}
                      </p>
                      <p className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        <Key className="size-2.5" />
                        {item.maskedKeySuffix ? `••••${item.maskedKeySuffix}` : "No key"}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex items-center gap-1.5">
                      {!item.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => void handleActivate(item.id)}
                        >
                          Set as default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] text-destructive hover:bg-destructive/10"
                        disabled={deletingId === item.id}
                        onClick={() => void handleDelete(item)}
                      >
                        <Trash2 className="mr-1 size-3" />
                        {deletingId === item.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={confirmDeleteItem !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete active provider?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{confirmDeleteItem?.displayName}&rdquo; is currently active. Deleting
              it will break AI reviews until a new default is set. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteItem(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                const id = confirmDeleteItem!.id;
                setConfirmDeleteItem(null);
                void doDelete(id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
