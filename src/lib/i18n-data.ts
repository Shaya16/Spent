"use client";

import { useTranslations } from "next-intl";
import type { FormatLastSyncLabels } from "./formatters";

type TranslatorFn = ReturnType<typeof useTranslations<string>>;

export function translateCategoryName(rawName: string, tCat: TranslatorFn): string {
  try {
    const translated = tCat(rawName);
    return translated && translated !== rawName ? translated : rawName;
  } catch {
    return rawName;
  }
}

export function translateProviderName(
  providerId: string,
  fallback: string,
  tBanks: TranslatorFn,
): string {
  try {
    const key = `${providerId}.name`;
    const translated = tBanks(key);
    return translated && translated !== key ? translated : fallback;
  } catch {
    return fallback;
  }
}

export function translateProviderBlurb(
  providerId: string,
  fallback: string,
  tBanks: TranslatorFn,
): string {
  try {
    const key = `${providerId}.blurb`;
    const translated = tBanks(key);
    return translated && translated !== key ? translated : fallback;
  } catch {
    return fallback;
  }
}

export function useFormatterLabels(): FormatLastSyncLabels {
  const t = useTranslations("formatters");
  return {
    never: t("neverSynced"),
    justNow: t("justNow"),
    minute: (n) => t("minutesAgoShort", { count: n }),
    hour: (n) => t("hoursAgoShort", { count: n }),
    day: (n) => t("daysAgoShort", { count: n }),
    week: (n) => t("weeksAgoShort", { count: n }),
    monthAgo: (n) => t("monthsAgoShort", { count: n }),
  };
}
