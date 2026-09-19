import { describe, expect, it } from "vitest";
import { isTransactionUnsupported } from "@/lib/accounts";

/**
 * Signup runs in a transaction, which needs a replica set. On a standalone
 * mongod — a typical developer laptop — it must fall back to the two-step
 * write with rollback instead of failing.
 *
 * The fallback only triggers if we recognise the error, and Mongoose wraps the
 * driver's error so the useful fields sit one or two levels down. These cases
 * are the shapes actually observed from Mongoose 9 / driver 6; getting this
 * wrong turns "no replica set" into a 500, which is exactly what happened
 * before the error chain was walked.
 */
describe("recognising an unsupported-transaction error", () => {
  it("matches the bare driver error", () => {
    expect(
      isTransactionUnsupported({
        message: "Transaction numbers are only allowed on a replica set member or mongos",
        code: 20,
        codeName: "IllegalOperation",
      })
    ).toBe(true);
  });

  it("matches when Mongoose wraps it in originalError", () => {
    expect(
      isTransactionUnsupported({
        message: "Operation failed",
        originalError: {
          message:
            "Transaction numbers are only allowed on a replica set member or mongos",
          code: 20,
          codeName: "IllegalOperation",
        },
      })
    ).toBe(true);
  });

  it("matches when it is nested under cause", () => {
    expect(
      isTransactionUnsupported({
        message: "wrapper",
        cause: { cause: { codeName: "IllegalOperation" } },
      })
    ).toBe(true);
  });

  it("does NOT match an ordinary duplicate-key error", () => {
    // Falling back on a duplicate key would retry a write that legitimately
    // failed, so this has to stay false.
    expect(
      isTransactionUnsupported({
        message: "E11000 duplicate key error collection: users index: email_1",
        code: 11000,
        codeName: "DuplicateKey",
      })
    ).toBe(false);
  });

  it("does not match a connection failure", () => {
    expect(
      isTransactionUnsupported(new Error("connect ECONNREFUSED 127.0.0.1:27017"))
    ).toBe(false);
  });

  it("copes with non-objects and cycles", () => {
    expect(isTransactionUnsupported(null)).toBe(false);
    expect(isTransactionUnsupported("nope")).toBe(false);

    const cyclic: Record<string, unknown> = { message: "loop" };
    cyclic.cause = cyclic;
    expect(isTransactionUnsupported(cyclic)).toBe(false);
  });
});
