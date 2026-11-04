import { describe, it, expect, vi } from "vitest";
import { checkForUpdate, createUpdateNotifier } from "@/server/update/check";

const github = (sha: string, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify({ sha }), { status: ok ? 200 : 403 })) as unknown as typeof fetch;

describe("checkForUpdate", () => {
  it("reports a newer commit on the tracked branch with a compare link", async () => {
    const info = await checkForUpdate({ repo: "Shaya16/Spent", branch: "main", current: "abc1234", fetchFn: github("def5678aaaa") });
    expect(info).toEqual({ current: "abc1234", latest: "def5678", url: "https://github.com/Shaya16/Spent/compare/abc1234...def5678aaaa" });
  });
  it("returns null when already on the latest commit", async () => {
    expect(await checkForUpdate({ repo: "Shaya16/Spent", branch: "main", current: "def5678", fetchFn: github("def5678aaaa") })).toBeNull();
  });
  it("returns null when the running commit is unknown or GitHub fails", async () => {
    expect(await checkForUpdate({ repo: "Shaya16/Spent", branch: "main", current: "unknown", fetchFn: github("x") })).toBeNull();
    expect(await checkForUpdate({ repo: "Shaya16/Spent", branch: "main", current: "abc1234", fetchFn: github("x", false) })).toBeNull();
  });
  it("rejects a repo or branch that is not a plain GitHub name", async () => {
    const fetchFn = github("def5678");
    expect(await checkForUpdate({ repo: "evil.com/x", branch: "main", current: "abc1234", fetchFn })).toBeNull();
    expect(await checkForUpdate({ repo: "Shaya16/Spent", branch: "../../x", current: "abc1234", fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("createUpdateNotifier", () => {
  it("sends one message per new version, never the same one twice", async () => {
    const send = vi.fn<(text: string) => Promise<void>>(async () => {});
    const notify = createUpdateNotifier(send);
    const info = { current: "abc1234", latest: "def5678", url: "https://github.com/x" };
    await notify(info);
    await notify(info);
    await notify({ ...info, latest: "aaa9999" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toContain("def5678");
    expect(send.mock.calls[0][0]).toContain("Spent-update");
  });
});
