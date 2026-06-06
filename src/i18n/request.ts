import { getRequestConfig } from "next-intl/server";
import { isLocale, routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` comes from the [locale] segment in the URL.
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : routing.defaultLocale;
  const messages = (await import(`./messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    timeZone: "Asia/Jerusalem",
  };
});
