"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";

/**
 * Razorpay Checkout, from the browser side.
 *
 * What this component is *not* allowed to do is decide that a payment worked.
 * Razorpay's handler fires in the customer's browser, and a browser can be
 * made to say anything — so the only thing done with that handler's payload is
 * to post it to `/api/billing/verify`, which checks the signature against the
 * key secret and asks Razorpay directly before a single field moves. The
 * screen below reports what the *server* said, never what the handler said.
 */

type CheckoutHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void; on: (event: string, cb: (payload: unknown) => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SRC}"]`
    );

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("checkout failed to load")));
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("checkout failed to load"));
    document.head.appendChild(script);
  });
}

type Status =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "verifying" }
  | { kind: "done"; message: string }
  | { kind: "cancelled"; message: string }
  | { kind: "error"; message: string };

export function UpgradeButton({
  label = "Upgrade now",
  prefill,
}: {
  label?: string;
  prefill?: { name?: string; email?: string };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const verify = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/billing/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus({
          kind: "error",
          message:
            payload?.error ??
            "We couldn't confirm that payment. Your plan is unchanged.",
        });
        return;
      }

      if (payload?.cancelled) {
        setStatus({ kind: "cancelled", message: payload.error });
        return;
      }

      setStatus({
        kind: "done",
        message: payload?.alreadyApplied
          ? "That payment was already applied — you're all set."
          : "Payment confirmed. Your plan is active.",
      });

      // The banner, the caps and the history all live in server components.
      router.refresh();
    },
    [router]
  );

  const start = useCallback(async () => {
    setStatus({ kind: "opening" });

    try {
      const created = await fetch("/api/billing/order", { method: "POST" });
      const payload = await created.json().catch(() => null);

      if (!created.ok || !payload?.order) {
        setStatus({
          kind: "error",
          message: payload?.error ?? "Couldn't open a payment. Nothing has been charged.",
        });
        return;
      }

      await loadCheckout();

      if (!window.Razorpay) {
        setStatus({
          kind: "error",
          message: "Razorpay's checkout didn't load. Check your connection and try again.",
        });
        return;
      }

      const order = payload.order;

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        order_id: order.orderId,
        name: APP_NAME,
        description: `${order.planName} plan — ${order.schoolName}`,
        prefill: { name: prefill?.name ?? "", email: prefill?.email ?? "" },
        theme: { color: "#12100E" },
        handler: (response: CheckoutHandlerResponse) => {
          setStatus({ kind: "verifying" });
          void verify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
        },
        modal: {
          ondismiss: () => {
            // Closing the window is not a failure worth apologising for, but
            // it is worth recording so the history explains itself later.
            setStatus({ kind: "verifying" });
            void verify({
              razorpay_order_id: order.orderId,
              cancelled: true,
              reason: "Closed the payment window.",
            });
          },
        },
      });

      checkout.on("payment.failed", (payload: unknown) => {
        const error = (payload as {
          error?: { description?: string; metadata?: { payment_id?: string } };
        })?.error;

        setStatus({ kind: "verifying" });
        void verify({
          razorpay_order_id: order.orderId,
          // The id lets the server ask Razorpay what actually went wrong.
          // Checkout's own description is often the short customer-facing
          // line ("Please use another method") while the API carries the
          // sentence that says what to do instead.
          razorpay_payment_id: error?.metadata?.payment_id,
          cancelled: true,
          reason: error?.description ?? "The payment was declined.",
        });
      });

      setStatus({ kind: "idle" });
      checkout.open();
    } catch {
      setStatus({
        kind: "error",
        message: "Something went wrong opening the payment. Nothing has been charged.",
      });
    }
  }, [prefill, verify]);

  const busy = status.kind === "opening" || status.kind === "verifying";

  return (
    <div className="space-y-3">
      <Button
        size="lg"
        variant="ink"
        disabled={busy || status.kind === "done"}
        onClick={() => void start()}
      >
        {status.kind === "opening"
          ? "Opening…"
          : status.kind === "verifying"
            ? "Confirming…"
            : status.kind === "done"
              ? "Done"
              : label}
      </Button>

      {status.kind !== "idle" && status.kind !== "opening" ? (
        <p
          role="status"
          aria-live="polite"
          className={
            status.kind === "done"
              ? "rounded-lg border-2 border-ink bg-lime-wash px-3.5 py-2.5 text-sm text-ink"
              : status.kind === "error"
                ? "rounded-lg border-2 border-ink bg-danger-wash px-3.5 py-2.5 text-sm text-ink"
                : status.kind === "cancelled"
                  ? "rounded-lg border-2 border-ink bg-paper-deep px-3.5 py-2.5 text-sm text-ink"
                  : "text-sm text-ink-soft"
          }
        >
          {status.kind === "verifying" ? "Checking that with Razorpay…" : status.message}
        </p>
      ) : null}
    </div>
  );
}
