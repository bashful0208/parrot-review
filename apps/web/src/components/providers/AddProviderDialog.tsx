"use client";

import { useState } from "react";
import { Plus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [testError, setTestError] = useState("");

  const [provider, setProvider] = useState<ProviderType>("anthropic");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  function handleProviderChange(value: ProviderType) {
    setProvider(value);
    resetTest();
    if (value === "alibaba") {
      setBaseUrl(ALIBABA_BASE_URL);
    } else if (value !== "custom") {
      setBaseUrl("");
    }
  }

  async function handleTest() {
    setTestError("");
    setTesting(true);
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, model, baseUrl: baseUrl || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setTested(true);
      } else {
        setTestError(data.error ?? "Test failed");
      }
    } catch {
      setTestError("Network error");
    } finally {
      setTesting(false);
    }
  }

  function resetTest() {
    setTested(false);
    setTestError("");
  }

  function resetForm() {
    setProvider("anthropic");
    setDisplayName("");
    setApiKey("");
    setModel("");
    setBaseUrl("");
    setError("");
    resetTest();
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
        body: JSON.stringify({
          provider,
          displayName,
          apiKey,
          model,
          baseUrl: baseUrl || undefined,
        }),
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

  const BASE_URL_PLACEHOLDER: Record<ProviderType, string> = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com/v1",
    alibaba: ALIBABA_BASE_URL,
    custom: "https://api.example.com/v1",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Add Configuration
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add AI Provider</DialogTitle>
          <DialogDescription>
            Configure an API key and model for an AI provider.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-2">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="provider">Provider Type</Label>
            <Select
              value={provider}
              onValueChange={(v) => handleProviderChange(v as ProviderType)}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="alibaba">Alibaba (Tongyi)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              placeholder="My Claude config"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); }}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); resetTest(); }}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              placeholder={MODEL_PLACEHOLDER[provider]}
              value={model}
              onChange={(e) => { setModel(e.target.value); resetTest(); }}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="baseUrl">
              Base URL <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="baseUrl"
              placeholder={BASE_URL_PLACEHOLDER[provider]}
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); resetTest(); }}
            />
          </div>

          {testError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="break-all">{testError}</span>
            </div>
          )}

          {tested && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="size-4" />
              Connection test passed
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testing || !apiKey || !model}
              onClick={() => void handleTest()}
            >
              {testing && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {testing ? "Testing…" : "Test Connection"}
            </Button>
            <Button type="submit" disabled={loading || !tested}>
              {loading && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {loading ? "Adding…" : "Add Provider"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
