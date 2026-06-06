import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The small uppercase "eyebrow" label used above card content and section
 * headers across the app. One canonical recipe so every card matches.
 * See docs/design-system.md section 2.
 */
function CardLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-label"
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { CardLabel };
