import { cn } from "@/lib/utils";

type ProgressTone = "on-track" | "heads-up" | "over" | "plenty-left" | "neutral";

const TONE_FILL: Record<ProgressTone, string> = {
  "on-track": "bg-status-on-track",
  "heads-up": "bg-status-heads-up",
  over: "bg-status-over",
  "plenty-left": "bg-status-plenty-left",
  neutral: "bg-foreground/40",
};

interface ProgressBarProps {
  /** 0-100; clamped. */
  percent: number;
  /** Optional "time elapsed" tick marker (0-100). */
  markPercent?: number;
  tone?: ProgressTone;
  className?: string;
  /** Track height utility. Defaults to h-2. */
  size?: "sm" | "default";
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * The budget / pace meter used on the home and budget screens. Handles
 * clamping and an optional elapsed-time marker. See design.md section 6.
 */
export function ProgressBar({
  percent,
  markPercent,
  tone = "on-track",
  className,
  size = "default",
}: ProgressBarProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-muted",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", TONE_FILL[tone])}
        style={{ width: `${clamp(percent)}%` }}
      />
      {markPercent != null && (
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ insetInlineStart: `${clamp(markPercent)}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
