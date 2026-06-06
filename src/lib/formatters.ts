import type { Locale } from "@/i18n/routing";

function bcp47(locale: Locale | "en-IL" | "he-IL" | undefined): string {
  if (!locale) return "en-IL";
  if (locale === "he") return "he-IL";
  if (locale === "en") return "en-IL";
  return locale;
}

// Scrapers sometimes hand us a symbol (₪) or loose alias instead of an ISO 4217
// code. Normalize the common ones so Intl.NumberFormat doesn't throw.
const CURRENCY_ALIASES: Record<string, string> = {
  "₪": "ILS",
  NIS: "ILS",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
};

// Currency and locale both vary per call, so we can't hoist a single formatter
// to module scope. Cache by `locale|code` instead so a list of transactions in
// the same currency reuses one formatter rather than rebuilding it per row.
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(bcp: string, code: string): Intl.NumberFormat {
  const key = `${bcp}|${code}`;
  const cached = currencyFormatters.get(key);
  if (cached) return cached;
  const fmt = new Intl.NumberFormat(bcp, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
  });
  currencyFormatters.set(key, fmt);
  return fmt;
}

export function formatCurrency(amount: number, currency = "ILS", locale?: Locale): string {
  const bcp = bcp47(locale);
  const code = (CURRENCY_ALIASES[currency] ?? currency).toUpperCase();
  const abs = Math.abs(amount);
  if (code === "ILS") {
    return `₪${abs.toLocaleString(bcp, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  try {
    return getCurrencyFormatter(bcp, code).format(abs);
  } catch {
    // Unknown/non-ISO currency: show the original token next to the amount.
    return `${currency} ${abs.toLocaleString(bcp, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getMonthRange(date: Date = new Date()): {
  from: string;
  to: string;
} {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    from: toLocalDateString(from),
    to: toLocalDateString(to),
  };
}

export function formatMonthLabel(date: Date, locale?: Locale): string {
  return date.toLocaleDateString(bcp47(locale), {
    month: "long",
    year: "numeric",
  });
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** True when `date` falls in the current calendar month. Used to cap forward navigation. */
export function isCurrentMonth(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export interface FormatLastSyncLabels {
  never: string;
  justNow: string;
  minute: (n: number) => string;
  hour: (n: number) => string;
  day: (n: number) => string;
  week: (n: number) => string;
  monthAgo: (n: number) => string;
}

const FALLBACK_LABELS: FormatLastSyncLabels = {
  never: "Never synced",
  justNow: "just now",
  minute: (n) => `${n}m ago`,
  hour: (n) => `${n}h ago`,
  day: (n) => `${n}d ago`,
  week: (n) => `${n}w ago`,
  monthAgo: (n) => `${n}mo ago`,
};

// The DB returns datetime('now') in UTC without a Z suffix.
export function formatLastSync(
  iso: string | null,
  labels: FormatLastSyncLabels = FALLBACK_LABELS,
): string {
  if (!iso) return labels.never;
  const synced = new Date(`${iso}Z`).getTime();
  const ageMs = Date.now() - synced;
  if (!Number.isFinite(ageMs) || ageMs < 0) return labels.justNow;

  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return labels.justNow;
  const min = Math.floor(sec / 60);
  if (min < 60) return labels.minute(min);
  const hr = Math.floor(min / 60);
  if (hr < 24) return labels.hour(hr);
  const day = Math.floor(hr / 24);
  if (day < 7) return labels.day(day);
  const wk = Math.floor(day / 7);
  if (wk < 5) return labels.week(wk);
  const mo = Math.floor(day / 30);
  return labels.monthAgo(mo);
}

// bcp47() only ever returns "en-IL" or "he-IL", so build both formatters once
// at module scope instead of rebuilding on every call.
const JERUSALEM_TIME_FORMATS: Record<string, Intl.DateTimeFormat> = {
  "en-IL": new Intl.DateTimeFormat("en-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }),
  "he-IL": new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }),
};

export function formatJerusalemTimeOfDay(iso: string, locale?: Locale): string {
  const fmt = JERUSALEM_TIME_FORMATS[bcp47(locale)] ?? JERUSALEM_TIME_FORMATS["en-IL"];
  return fmt.format(new Date(iso));
}
