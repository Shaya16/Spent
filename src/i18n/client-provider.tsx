"use client";

import { type IntlError, IntlErrorCode, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

interface Props {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
}

function onError(err: IntlError) {
  // Categories, banks, and ollama models include user-generated keys that
  // may not exist in the bundle — fall through silently to the fallback.
  if (err.code === IntlErrorCode.MISSING_MESSAGE) return;
  // eslint-disable-next-line no-console
  console.error(err);
}

function getMessageFallback({
  namespace,
  key,
  error,
}: {
  namespace?: string;
  key: string;
  error: IntlError;
}): string {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) {
    // Use the raw key (e.g. "Coffee & Cafes") as the fallback so user-defined
    // categories display as-is when there's no translation.
    return key;
  }
  return `${namespace ? `${namespace}.` : ""}${key}`;
}

export function I18nProvider({ locale, messages, children }: Props) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={onError}
      getMessageFallback={getMessageFallback}
    >
      {children}
    </NextIntlClientProvider>
  );
}
