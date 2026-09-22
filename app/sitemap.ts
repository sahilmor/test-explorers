import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, siteUrl } from "@/lib/site";

/** Only the public pages. The rest of the app needs an account to see. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: `${base}${route === "/" ? "" : route}`,
    lastModified: now,
    changeFrequency: route === "/" || route === "/pricing" ? "monthly" : "yearly",
    priority: route === "/" ? 1 : route === "/pricing" ? 0.8 : 0.4,
  }));
}
