import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Briefcase,
  CircleDot,
  Coffee,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  type LucideIcon,
  PawPrint,
  Plane,
  Receipt,
  RefreshCw,
  RotateCcw,
  Shield,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Ticket,
  TramFront,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";

/**
 * The canonical category icon set. Keyed by the icon names seeded in the DB
 * migrations. Single source of truth so a category renders the same glyph on
 * the grid, the budget detail sheet, and the settings sheets. See docs/design-system.md.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "shopping-basket": ShoppingBasket,
  "utensils-crossed": UtensilsCrossed,
  "tram-front": TramFront,
  "shopping-bag": ShoppingBag,
  ticket: Ticket,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  receipt: Receipt,
  "refresh-cw": RefreshCw,
  plane: Plane,
  banknote: Banknote,
  "arrow-left-right": ArrowLeftRight,
  shield: Shield,
  home: Home,
  sparkles: Sparkles,
  "circle-dot": CircleDot,
  coffee: Coffee,
  "paw-print": PawPrint,
  gift: Gift,
  baby: Baby,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  "rotate-ccw": RotateCcw,
  landmark: Landmark,
};

export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  return CATEGORY_ICONS[name ?? "circle-dot"] ?? CircleDot;
}

/** Renders a category's icon by its stored name, falling back to a neutral dot. */
export function CategoryIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = getCategoryIcon(name);
  return <Icon className={className} aria-hidden />;
}
