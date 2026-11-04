import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import pkg from "../../../../package.json";
import { dataDir } from "@/server/lib/data-dir";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    version: pkg.version,
    hasDb: fs.existsSync(path.join(dataDir(), "spent.db")),
  });
}
