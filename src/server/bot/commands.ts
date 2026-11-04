import "server-only";

import { loadInsights } from "../insights/data";
import { forecastCards } from "../insights/forecast";
import { getLastSyncRun } from "../db/queries/sync-runs";

export interface BotConfig {
  chatId: number;
  billingDay: number;
}

export interface BotDeps {
  /** Undefined until the app has been set up. */
  workspaceId: number | undefined;
  today: string;
  runSync: () => Promise<string>;
  isSyncRunning?: () => boolean;
}

const money = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;

const HELP = [
  "/month - this month's spending",
  "/subs - detected subscriptions",
  "/forecast - next 3 card bills",
  "/status - last sync",
  "/sync - sync now",
].join("\n");

// Telegram rejects messages over 4096 characters.
const TELEGRAM_LIMIT = 4000;

/** Splits a reply into Telegram-sized parts, on line breaks where possible. */
export function splitMessage(text: string, max = TELEGRAM_LIMIT): string[] {
  const parts: string[] = [];
  let current: string | null = null;
  for (const line of text.split("\n")) {
    // Split by code point so an emoji is never cut in half.
    const chars = Array.from(line);
    const pieces: string[] = [];
    for (let i = 0; i < chars.length; i += max) pieces.push(chars.slice(i, i + max).join(""));
    if (pieces.length === 0) pieces.push("");
    for (const piece of pieces) {
      if (current !== null && current.length + 1 + piece.length <= max) {
        current += `\n${piece}`;
      } else {
        if (current !== null) parts.push(current);
        current = piece;
      }
    }
  }
  if (current !== null) parts.push(current);
  // Telegram rejects an empty message.
  return parts.filter((p) => p.trim().length > 0);
}

/** Returns the reply text, or null when the message is not from the configured chat. */
export async function handleCommand(
  text: string,
  fromChatId: number,
  cfg: BotConfig,
  deps: BotDeps
): Promise<string | null> {
  if (fromChatId !== cfg.chatId) return null;
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
  const workspaceId = deps.workspaceId;
  if (workspaceId === undefined) return "Spent is not set up yet. Finish setup in the app first.";

  switch (cmd) {
    case "/month": {
      const i = loadInsights(workspaceId, deps.today);
      const lines = i.topCategories.map((c) => `${c.name}: ${money(c.total)}`);
      return [`Spent this month: ${money(i.monthTotal)}`, ...lines].join("\n");
    }
    case "/subs": {
      const i = loadInsights(workspaceId, deps.today);
      if (i.series.length === 0) return "No subscriptions detected yet.";
      return i.series
        .map((s) => {
          const change = s.priceChange ? ` (price ${money(s.priceChange.from)} -> ${money(s.priceChange.to)})` : "";
          return `${s.merchant} ${money(s.expectedAmount)} ${s.cadence}${s.status === "candidate" ? " [maybe]" : ""}${change}`;
        })
        .join("\n");
    }
    case "/forecast": {
      const i = loadInsights(workspaceId, deps.today, cfg.billingDay);
      const forecast = forecastCards({ today: deps.today, cards: i.cards, series: i.series, installments: i.installments });
      if (forecast.length === 0) return "No card activity yet.";
      return forecast
        .map(
          (f) =>
            `${f.date} card ${f.account?.slice(-4)}: ${money(f.total)} (posted ${money(f.parts.posted)}, recurring ${money(f.parts.recurring)}, installments ${money(f.parts.installments)}, other ${money(f.parts.discretionary)})`
        )
        .join("\n");
    }
    case "/status": {
      const run = getLastSyncRun(workspaceId);
      return run ? `Last sync: ${run.status} at ${run.startedAt}` : "No sync yet.";
    }
    case "/sync":
      // Two syncs at once hit the bank twice and race on the same rows.
      if (deps.isSyncRunning?.()) return "A sync is already running. Try again when it finishes.";
      return deps.runSync();
    default:
      return HELP;
  }
}
