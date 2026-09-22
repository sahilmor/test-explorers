// A local stand-in for Razorpay's API, so the dev server can run the real
// order → verify → activate path without an account.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const KEY_SECRET = "local-demo-key-secret";
const orders = new Map();
const payments = new Map();
let n = 0;

createServer((req, res) => {
  const url = new URL(req.url, "http://stub");

  if (req.method === "POST" && url.pathname === "/v1/orders") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const input = JSON.parse(raw || "{}");
      const id = `order_demo${++n}`;
      orders.set(id, { id, amount: input.amount, currency: input.currency });
      // Pre-settle it as captured, as a successful card payment would be.
      const pid = `pay_demo${n}`;
      payments.set(pid, {
        id: pid, order_id: id, status: "captured",
        amount: input.amount, currency: input.currency, error_description: null,
      });
      console.log(`order ${id} -> payment ${pid} sig ${createHmac("sha256", KEY_SECRET).update(`${id}|${pid}`).digest("hex")}`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...orders.get(id), status: "created" }));
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/v1/payments/")) {
    const p = payments.get(decodeURIComponent(url.pathname.slice("/v1/payments/".length)));
    if (p) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(p));
      return;
    }
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { description: "stub: not found" } }));
}).listen(4499, "127.0.0.1", () => console.log("razorpay stub on 4499"));
