"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "zh-CN", label: "中文 (zh-CN)" },
  { value: "en-US", label: "English (en-US)" },
  { value: "es-ES", label: "Español (es-ES)" },
];

export default function LanguageForm({ currentLanguage }: { currentLanguage: string }) {
  const [language, setLanguage] = useState(currentLanguage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setMessage({ type: "success", text: "Language saved." });
      } else {
        setMessage({ type: "error", text: data.error ?? "Failed to save language." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="language-select">Review Output Language</Label>
        <p className="text-sm text-muted-foreground">
          All future review comments will be written in the selected language.
        </p>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger id="language-select" className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleSave} disabled={saving || language === currentLanguage}>
        {saving ? "Saving..." : "Save"}
      </Button>

      {message && (
        <p
          className={
            message.type === "success"
              ? "text-sm text-green-600 dark:text-green-400"
              : "text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
