/**
 * The product's name, in one place.
 *
 * It has been renamed once already, and that meant a repo-wide find-and-replace
 * across page titles, OG tags, email templates and legal copy. Everything that
 * renders the name at runtime now reads it from here, so the next rename is
 * this file plus the handful of places a constant cannot reach — package.json,
 * the docs, and the CSS header comment.
 *
 * No Mongoose and no React, so anything may import it.
 */

/** Display name. Sentence case, as it appears in prose and titles. */
export const APP_NAME = "Shalasys";

/** For package names, database names, slugs and anything URL-shaped. */
export const APP_SLUG = "shalasys";

/**
 * The wordmark is two-tone, so the name is split for rendering: the first part
 * in ink, the second in coral. Kept here rather than hardcoded in each of the
 * three places that draw it — the web wordmark, the email header and the
 * Open Graph card — because they have to agree.
 */
export const APP_NAME_PARTS = { head: "Shala", tail: "sys" } as const;

/** One line, used as the default meta description and in the footer. */
export const APP_TAGLINE =
  "Run your school's tests online instead of on paper. Set a paper once, send it to every class, and have it marked before the bell.";
