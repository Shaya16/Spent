import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { type AppSettings, RECOMMENDED_GEMINI_MODELS } from "@/lib/types";
import { getOrm } from "../orm";
import { settings, workspaceSettings } from "../schema";

// Global settings live in the `settings` table and apply to every workspace.
// Currently: ai_provider, ai_ollama_url, ai_ollama_model, ai_gemini_model,
// plus encrypted Claude/Gemini API key triples.
export function getGlobalSetting(key: string): string | null {
  const row = getOrm()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value ?? null;
}

export function setGlobalSetting(key: string, value: string): void {
  getOrm()
    .insert(settings)
    .values({ key, value, updatedAt: sql`datetime('now')` })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`datetime('now')` },
    })
    .run();
}

export function deleteGlobalSetting(key: string): void {
  getOrm().delete(settings).where(eq(settings.key, key)).run();
}

// Per-workspace settings live in `workspace_settings`.
// Currently: months_to_sync, payday_day, scraper_show_browser.
export function getWorkspaceSetting(workspaceId: number, key: string): string | null {
  const row = getOrm()
    .select({ value: workspaceSettings.value })
    .from(workspaceSettings)
    .where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, key)))
    .get();
  return row?.value ?? null;
}

export function setWorkspaceSetting(workspaceId: number, key: string, value: string): void {
  getOrm()
    .insert(workspaceSettings)
    .values({ workspaceId, key, value, updatedAt: sql`datetime('now')` })
    .onConflictDoUpdate({
      target: [workspaceSettings.workspaceId, workspaceSettings.key],
      set: { value, updatedAt: sql`datetime('now')` },
    })
    .run();
}

// Back-compat aliases so existing call sites that store the Claude API key
// (settings.ts in src/server/ai/providers/claude.ts) keep working unchanged.
export const getSetting = getGlobalSetting;
export const setSetting = setGlobalSetting;

const AUTO_SYNC_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_GEMINI_MODEL = RECOMMENDED_GEMINI_MODELS[0].name;

export function getAppSettings(workspaceId: number): AppSettings {
  const targetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
  const target = targetRaw != null ? Number(targetRaw) : NaN;
  const storedTime = getGlobalSetting("auto_sync_time");
  return {
    monthsToSync: Number(getWorkspaceSetting(workspaceId, "months_to_sync") ?? "3"),
    aiProvider: (getGlobalSetting("ai_provider") ?? "none") as AppSettings["aiProvider"],
    geminiModel: getGlobalSetting("ai_gemini_model") ?? DEFAULT_GEMINI_MODEL,
    ollamaUrl: getGlobalSetting("ai_ollama_url") ?? "http://localhost:11434",
    ollamaModel: getGlobalSetting("ai_ollama_model") ?? "llama3.2:3b",
    showBrowser: getWorkspaceSetting(workspaceId, "scraper_show_browser") === "true",
    paydayDay: Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1"),
    monthlyTarget: Number.isFinite(target) && target > 0 ? target : null,
    autoSyncEnabled: getGlobalSetting("auto_sync_enabled") === "true",
    autoSyncTime: storedTime && AUTO_SYNC_TIME_RE.test(storedTime) ? storedTime : "06:00",
    treatAtmAsTransfers: getGlobalSetting("treat_atm_as_transfers") === "true",
  };
}

export function updateAppSettings(
  workspaceId: number,
  settingsToApply: Partial<AppSettings>,
): AppSettings {
  getOrm().transaction((tx) => {
    if (settingsToApply.monthsToSync !== undefined) {
      setWorkspaceSetting(workspaceId, "months_to_sync", String(settingsToApply.monthsToSync));
    }
    if (settingsToApply.aiProvider !== undefined) {
      setGlobalSetting("ai_provider", settingsToApply.aiProvider);
    }
    if (settingsToApply.ollamaUrl !== undefined) {
      setGlobalSetting("ai_ollama_url", settingsToApply.ollamaUrl);
    }
    if (settingsToApply.ollamaModel !== undefined) {
      setGlobalSetting("ai_ollama_model", settingsToApply.ollamaModel);
    }
    if (settingsToApply.geminiModel !== undefined) {
      setGlobalSetting("ai_gemini_model", settingsToApply.geminiModel);
    }
    if (settingsToApply.showBrowser !== undefined) {
      setWorkspaceSetting(
        workspaceId,
        "scraper_show_browser",
        settingsToApply.showBrowser ? "true" : "false",
      );
    }
    if (settingsToApply.paydayDay !== undefined) {
      const clamped = Math.max(1, Math.min(28, Math.round(settingsToApply.paydayDay)));
      setWorkspaceSetting(workspaceId, "payday_day", String(clamped));
    }
    if (settingsToApply.monthlyTarget !== undefined) {
      const t = settingsToApply.monthlyTarget;
      if (t == null || !Number.isFinite(t) || t <= 0) {
        tx.delete(workspaceSettings)
          .where(
            and(
              eq(workspaceSettings.workspaceId, workspaceId),
              eq(workspaceSettings.key, "monthly_target"),
            ),
          )
          .run();
      } else {
        setWorkspaceSetting(workspaceId, "monthly_target", String(Math.round(t)));
      }
    }
    if (settingsToApply.autoSyncEnabled !== undefined) {
      setGlobalSetting("auto_sync_enabled", settingsToApply.autoSyncEnabled ? "true" : "false");
    }
    if (settingsToApply.autoSyncTime !== undefined) {
      if (!AUTO_SYNC_TIME_RE.test(settingsToApply.autoSyncTime)) {
        throw new Error("autoSyncTime must be HH:MM 24-hour");
      }
      setGlobalSetting("auto_sync_time", settingsToApply.autoSyncTime);
    }
    if (settingsToApply.treatAtmAsTransfers !== undefined) {
      setGlobalSetting(
        "treat_atm_as_transfers",
        settingsToApply.treatAtmAsTransfers ? "true" : "false",
      );
    }
  });
  return getAppSettings(workspaceId);
}
