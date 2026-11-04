import { LOCAL_PROVIDER_LOGOS } from "./provider-logos.generated";

/**
 * Path of a provider's bundled logo, or null when none is bundled. Logos ship in public/banks
 * (see scripts/fetch-provider-icons.mjs) so the browser never asks a third party for them.
 */
export function providerLogoSrc(domain: string | undefined): string | null {
  return domain && LOCAL_PROVIDER_LOGOS.has(domain) ? `/banks/${domain}.png` : null;
}
