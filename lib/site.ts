import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

/**
 * The site's own address.
 *
 * Canonical URLs, sitemap entries and OG tags all need an absolute origin, and
 * a relative one silently produces `og:url = /pricing`, which no crawler can
 * use. On Vercel the production URL is in the environment; locally it falls
 * back to localhost so the tags are at least well-formed.
 */
export function siteUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export const SITE_NAME = APP_NAME;

export const SITE_DESCRIPTION = APP_TAGLINE;

/** Pages a crawler should index. Everything else is behind a login. */
export const PUBLIC_ROUTES = ["/", "/pricing", "/privacy", "/terms", "/login", "/signup"] as const;
