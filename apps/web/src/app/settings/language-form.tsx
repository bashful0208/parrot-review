"use client";

import { useState } from "react";
import { Globe, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Language = "zh-CN" | "en-US" | "es-ES";

const LANGUAGES: { value: Language; label: string; locale: string; hint: string }[] = [
  { value: "zh-CN", label: "中文", locale: "zh-CN", hint: "Simplified Chinese" },
  { value: "en-US", label: "English", locale: "en-US", hint: "American English" },
  { value: "es-ES", label: "Español", locale: "es-ES", hint: "European Spanish" },
];

export default function LanguageForm({ currentLanguage }: { currentLanguage: string }) {
  const [language, setLanguage] = useState<Language>(currentLanguage as Language);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const changed = language !== currentLanguage;

  async function handleSave() {
    if (!changed) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setSaved(true);
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4" />
          Review Output Language
        </CardTitle>
        <CardDescription>
          All future review comments, issue descriptions, and PR summaries will be written in
          the selected language. Changing this does not affect past reviews.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="grid gap-3 sm:grid-cols-3">
          {LANGUAGES.map((lang) => {
            const selected = language === lang.value;
            return (
              <label
                key={lang.value}
                className={cn(
                  "relative flex cursor-pointer flex-col gap-1.5 rounded-lg border-2 px-4 py-3.5 transition-all",
                  "hover:bg-accent/50",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border"
                )}
              >
                <input
                  type="radio"
                  name="language"
                  value={lang.value}
                  checked={selected}
                  onChange={() => {
                    setLanguage(lang.value);
                    setSaved(false);
                  }}
                  className="sr-only"
                />
                <span className="text-sm font-medium">{lang.label}</span>
                <span className="text-xs text-muted-foreground">{lang.hint}</span>
                <span className="text-[11px] font-mono text-muted-foreground/70">
                  {lang.locale}
                </span>
                {selected && (
                  <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !changed} size="lg">
            {saving && <Loader2 className="mr-2 size-5 animate-spin" />}
            {saving ? "Saving..." : "Save Preference"}
          </Button>
          {saved && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              ✓ Saved successfully
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
