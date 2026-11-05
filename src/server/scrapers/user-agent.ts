// Headless Chromium announces itself as "HeadlessChrome", and some bank WAFs (Behatsdaa) answer that with 403.
export function withoutHeadless(userAgent: string): string {
  return userAgent.replace("HeadlessChrome/", "Chrome/");
}

// Runs before each scraper navigates. A scraper that sets its own user agent still overrides this.
export async function preparePage(page: {
  browser(): { userAgent(): Promise<string> };
  setUserAgent(userAgent: string): Promise<void>;
}): Promise<void> {
  await page.setUserAgent(withoutHeadless(await page.browser().userAgent()));
}
