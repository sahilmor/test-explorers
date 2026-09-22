import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Everything past the front door is private, so the only thing worth crawling
 * is the marketing site. The disallows are not a security measure — those
 * routes are gated server-side — they just keep a school's dashboard out of
 * search results and stop crawlers wasting requests on pages that will redirect
 * them to a login.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/teacher", "/student", "/platform", "/api"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
