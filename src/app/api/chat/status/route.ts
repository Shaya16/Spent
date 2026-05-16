import { NextResponse } from "next/server";
import { isChatAvailable } from "@/server/ai/chat-factory";
import { getSetting } from "@/server/db/queries/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getSetting("ai_provider") ?? "none";
  const available = isChatAvailable();
  return NextResponse.json({
    available,
    provider,
    // Surface a stable code to the UI so it can show a tailored CTA.
    reason: available
      ? null
      : provider === "ollama"
        ? "ollama-not-supported"
        : provider === "none"
          ? "not-configured"
          : "missing-api-key",
  });
}
