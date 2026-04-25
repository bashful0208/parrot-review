"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProviderType = "anthropic" | "openai" | "alibaba" | "custom";

const MODEL_PLACEHOLDER: Record<ProviderType, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
  alibaba: "qwen-max",
  custom: "your-model-name",
};

const ALIBABA_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

interface AddProviderDialogProps {
  onSuccess: () => void;
}

export default function AddProviderDialog({ onSuccess }: AddProviderDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [provider, setProvider] = useState<ProviderType>("anthropic");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  function handleProviderChange(value: ProviderType) {
    setProvider(value);
    if (value === "alibaba") {
      setBaseUrl(ALIBABA_BASE_URL);
    } else if (value !== "custom") {
      setBaseUrl("");
    }
  }

  function resetForm() {
    setProvider("anthropic");
    setDisplayName("");
    setApiKey("");
    setModel("");
    setBaseUrl("");
    setError("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTimeout(resetForm, 300);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, displayName, apiKey, model, baseUrl: baseUrl || undefined }),
      });

      if (res.ok) {
        setOpen(false);
        setTimeout(resetForm, 300);
        onSuccess();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to add provider");
      }
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  const showBaseUrl = provider === "alibaba" || provider === "custom";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">添加配置</Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>添加 AI 模型配置</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Provider */}
          <div className="space-y-1.5">
            <Label htmlFor="provider">Provider 类型</Label>
            <Select value={provider} onValueChange={(v) => handleProviderChange(v as ProviderType)}>
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="alibaba">Alibaba (通义)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              placeholder="我的 Claude 配置"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              placeholder={MODEL_PLACEHOLDER[provider]}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
            />
          </div>

          {/* Base URL (alibaba / custom only) */}
          {showBaseUrl && (
            <div className="space-y-1.5">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                placeholder={provider === "alibaba" ? ALIBABA_BASE_URL : "https://api.example.com/v1"}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "添加中…" : "添加"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
