import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spent",
    short_name: "Spent",
    description: "A private, local-first personal finance tracker for Israeli banks.",
    start_url: "/",
    display: "standalone",
    background_color: "#fcf7ed",
    theme_color: "#fcf7ed",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
