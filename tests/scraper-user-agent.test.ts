import { describe, expect, it } from "vitest";
import { withoutHeadless } from "@/server/scrapers/user-agent";

describe("withoutHeadless", () => {
  it("removes the HeadlessChrome marker that bank WAFs block", () => {
    expect(
      withoutHeadless(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36"
      )
    ).toBe(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"
    );
  });

  it("leaves a normal browser user agent unchanged", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
    expect(withoutHeadless(ua)).toBe(ua);
  });
});
