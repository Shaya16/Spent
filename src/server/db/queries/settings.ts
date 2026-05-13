import "server-only";

import { getDb } from "../index";
import type { AppSettings } from "@/lib/types";

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value);
}

export function getAppSettings(): AppSettings {
  return {
    monthsToSync: Number(getSetting("months_to_sync") ?? "3"),
    aiProvider: (getSetting("ai_provider") ?? "none") as AppSettings["aiProvider"],
    ollamaUrl: getSetting("ai_ollama_url") ?? "http://localhost:11434",
    ollamaModel: getSetting("ai_ollama_model") ?? "llama3.2:3b",
    showBrowser: getSetting("scraper_show_browser") === "true",
  };
}

export function updateAppSettings(settings: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const update = db.transaction(() => {
    if (settings.monthsToSync !== undefined) {
      setSetting("months_to_sync", String(settings.monthsToSync));
    }
    if (settings.aiProvider !== undefined) {
      setSetting("ai_provider", settings.aiProvider);
    }
    if (settings.ollamaUrl !== undefined) {
      setSetting("ai_ollama_url", settings.ollamaUrl);
    }
    if (settings.ollamaModel !== undefined) {
      setSetting("ai_ollama_model", settings.ollamaModel);
    }
    if (settings.showBrowser !== undefined) {
      setSetting("scraper_show_browser", settings.showBrowser ? "true" : "false");
    }
  });
  update();
  return getAppSettings();
}
