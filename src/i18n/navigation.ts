import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware replacements for next/link and next/navigation. `Link` and the
// router prefix the active locale automatically; `usePathname` returns the path
// WITHOUT the locale prefix (so active-link checks stay locale-agnostic).
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
