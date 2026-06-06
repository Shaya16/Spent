import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { getMessages, setRequestLocale } from "next-intl/server";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n/client-provider";
import { dirFor, isLocale, locales } from "@/i18n/routing";
import "../globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "Spent",
    template: "%s · Spent",
  },
  applicationName: "Spent",
  description:
    "A private, local-first personal finance tracker for Israeli banks. AI-powered categorization, with credentials that never leave your machine. Open source and self-hosted.",
  openGraph: {
    title: "Spent",
    description:
      "A private, local-first personal finance tracker for Israeli banks. Open source and self-hosted.",
    siteName: "Spent",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcf7ed" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1a17" },
  ],
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = dirFor(locale);
  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} messages={messages as Record<string, unknown>}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <QueryProvider>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </QueryProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
