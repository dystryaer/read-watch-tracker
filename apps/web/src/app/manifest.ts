import type { MetadataRoute } from "next";

/** Installable web app (SPEC §9.3): opens straight on the quick-update screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Read-Watch-Tracker",
    short_name: "Lesestand",
    description: "Wo stehe ich bei meinen Manga, Novels, E-Books und Serien?",
    start_url: "/quick",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    lang: "de",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
