import { defineRouting } from "next-intl/routing";

export const locales = ["en", "he"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

// Locale is carried in the URL (/en, /he). `localePrefix: "always"` means
// every path is prefixed; the proxy redirects an unprefixed path to the
// saved-language cookie (falling back to the default locale).
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeCookie: { name: LOCALE_COOKIE },
});

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}
