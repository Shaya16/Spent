"use client";

import { useState } from "react";
import { providerLogoSrc } from "@/lib/provider-logos";

interface ProviderBadgeProps {
  color: string;
  name: string;
  domain?: string;
  size?: number;
  radius?: number;
}

export function ProviderBadge({
  color,
  name,
  domain,
  size = 44,
  radius = 12,
}: ProviderBadgeProps) {
  const [imageOk, setImageOk] = useState<boolean | null>(null);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  // Bundled with the app; no third-party request reveals which banks the user has.
  const logoUrl = providerLogoSrc(domain);

  const showImage = imageOk === true && logoUrl != null;
  const imageInset = Math.max(2, Math.round(size * 0.12));
  const imageSize = size - imageInset * 2;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: showImage ? "#ffffff" : color,
        border: showImage ? "1px solid var(--border)" : "none",
      }}
    >
      {logoUrl != null && imageOk !== false ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          width={imageSize}
          height={imageSize}
          onLoad={() => setImageOk(true)}
          onError={() => setImageOk(false)}
          className={
            showImage
              ? "block object-contain"
              : "pointer-events-none absolute opacity-0"
          }
          style={{ width: imageSize, height: imageSize }}
        />
      ) : null}
      {!showImage && (
        <>
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
        </>
      )}
    </div>
  );
}
