import { NextResponse } from "next/server";
import { deliverOtp } from "@/server/sync/otp-bridge";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: { syncRunId?: number; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const syncRunId = Number(body.syncRunId);
  const code = (body.code ?? "").trim();

  if (!Number.isFinite(syncRunId) || syncRunId <= 0) {
    return NextResponse.json(
      { success: false, message: "syncRunId is required." },
      { status: 400 }
    );
  }
  if (!code) {
    return NextResponse.json(
      { success: false, message: "code is required." },
      { status: 400 }
    );
  }

  const result = deliverOtp(syncRunId, workspaceId, code);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: result.reason ?? "Could not deliver OTP." },
      { status: 410 }
    );
  }

  return NextResponse.json({ success: true });
}
