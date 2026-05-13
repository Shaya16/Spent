interface ProviderBadgeProps {
  color: string;
  name: string;
  size?: number;
  radius?: number;
}

export function ProviderBadge({
  color,
  name,
  size = 44,
  radius = 12,
}: ProviderBadgeProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: color,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(0,0,0,0.05))",
        }}
      />
      <span
        className="relative font-bold tracking-tight"
        style={{ fontSize: size * 0.4 }}
      >
        {initials}
      </span>
    </div>
  );
}
