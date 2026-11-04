import "server-only";

import { loadInsights } from "../insights/data";
import { forecastBill } from "../insights/forecast";
import { getLastSyncRun } from "../db/queries/sync-runs";

export interface BotConfig {
  chatId: number;
  billingDay: number;
}

export interface BotDeps {
  workspaceId: number;
  today: string;
  runSync: () => Promise<string>;
}

const money = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;

const HELP = [
  "/month - this month's spending",
  "/subs - detected subscriptions",
  "/forecast - next 3 card bills",
  "/status - last sync",
  "/sync - sync now",
].join("\n");

/** Returns the reply text, or null when the message is not from the configured chat. */
export async function handleCommand(
  text: string,
  fromChatId: number,
  cfg: BotConfig,
  deps: BotDeps
): Promise<string | null> {
  if (fromChatId !== cfg.chatId) return null;
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");

  switch (cmd) {
    case "/month": {
      const i = loadInsights(deps.workspaceId, deps.today);
      const lines = i.topCategories.map((c) => `${c.name}: ${money(c.total)}`);
      return [`Spent this month: ${money(i.monthTotal)}`, ...lines].join("\n");
    }
    case "/subs": {
      const i = loadInsights(deps.workspaceId, deps.today);
      if (i.series.length === 0) return "No subscriptions detected yet.";
      return i.series
        .map((s) => {
          const change = s.priceChange ? ` (price ${money(s.priceChange.from)} -> ${money(s.priceChange.to)})` : "";
          return `${s.merchant} ${money(s.expectedAmount)} ${s.cadence}${s.status === "candidate" ? " [maybe]" : ""}${change}`;
        })
        .join("\n");
    }
    case "/forecast": {
      const i = loadInsights(deps.workspaceId, deps.today);
      return forecastBill({
        billingDay: cfg.billingDay,
        today: deps.today,
        series: i.series,
        installments: i.installments,
        avgDiscretionary: i.avgDiscretionary,
        posted: i.posted,
      })
        .map(
          (f) =>
            `${f.date}: ${money(f.total)} (posted ${money(f.parts.posted)}, recurring ${money(f.parts.recurring)}, installments ${money(f.parts.installments)}, other ${money(f.parts.discretionary)})`
        )
        .join("\n");
    }
    case "/status": {
      const run = getLastSyncRun(deps.workspaceId);
      return run ? `Last sync: ${run.status} at ${run.startedAt}` : "No sync yet.";
    }
    case "/sync":
      return deps.runSync();
    default:
      return HELP;
  }
}
