import "server-only";

import { Bot } from "grammy";
import { handleCommand, splitMessage, type BotConfig } from "./commands";
import { listAllWorkspaceIds } from "../lib/workspace-context";
import { israelToday } from "../lib/date-utils";
import { getActivitySnapshot } from "../sync/activity";
import { checkForUpdate, createUpdateNotifier } from "../update/check";

declare global {
  var __spentBot: Bot | undefined;
}

/** Starts long polling when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set; otherwise does nothing. */
export function startBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = Number(process.env.TELEGRAM_CHAT_ID);
  if (!token || !chatId || globalThis.__spentBot) return;

  const cfg: BotConfig = { chatId, billingDay: Number(process.env.CARD_BILLING_DAY) || 10 };
  const bot = new Bot(token);

  bot.on("message:text", async (ctx) => {
    const reply = await handleCommand(ctx.message.text, ctx.chat.id, cfg, {
      workspaceId: listAllWorkspaceIds()[0],
      today: israelToday(),
      isSyncRunning: () => getActivitySnapshot().sync.active,
      runSync: async () => {
        const { runAllWorkspaces } = await import("../sync/orchestrator");
        const summaries = await runAllWorkspaces(undefined, undefined, "manual");
        const added = summaries.reduce((s, w) => s + w.added, 0);
        const failed = summaries.flatMap((w) => w.providers).filter((p) => !p.ok);
        return failed.length
          ? `Sync finished with errors: ${failed.map((f) => f.label).join(", ")}`
          : `Sync done, ${added} new transactions`;
      },
    });
    if (reply) for (const part of splitMessage(reply)) await ctx.reply(part);
  });

  bot.catch((err) => console.error("[bot]", err.message));
  globalThis.__spentBot = bot;
  void bot.start();
  scheduleUpdateCheck((text) => bot.api.sendMessage(chatId, text).then(() => undefined));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** With SPENT_UPDATE_CHECK=1, tells the user in Telegram when the tracked branch has a newer commit. Never installs anything. */
function scheduleUpdateCheck(send: (text: string) => Promise<void>): void {
  const current = process.env.SPENT_COMMIT ?? "";
  if (process.env.SPENT_UPDATE_CHECK !== "1" || !current || current === "unknown") return;

  const notify = createUpdateNotifier(send);
  const run = async () => {
    const info = await checkForUpdate({
      repo: process.env.SPENT_UPDATE_REPO || "Shaya16/Spent",
      branch: process.env.SPENT_UPDATE_BRANCH || "main",
      current,
    });
    if (info) await notify(info).catch((err) => console.error("[update]", err.message));
  };
  setTimeout(() => void run(), 60_000).unref();
  setInterval(() => void run(), DAY_MS).unref();
}
