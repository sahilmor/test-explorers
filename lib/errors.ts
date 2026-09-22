/**
 * The error every lib function throws when a request is wrong rather than
 * broken, carrying the HTTP status the route should answer with and, where it
 * helps, the form field to blame.
 *
 * It lives on its own rather than in lib/school-setup.ts so that modules that
 * school-setup itself depends on — lib/entitlements.ts, which it calls before
 * writing anything — can subclass it without an import cycle.
 */
export class SetupError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string
  ) {
    super(message);
    this.name = "SetupError";
  }
}
