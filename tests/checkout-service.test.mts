import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutInput, gatewayFixture } from "./payments.test.mts";
import {
  createOrder,
  currentOrder,
  orderAction,
  refreshOrder,
} from "../src/lib/server/checkout-service.ts";
import {
  getOrderStore,
  OrderStore,
  publicOrder,
} from "../src/lib/server/order-store.ts";
import { parseOrderInput, parseGatewayPayment } from "../src/lib/payments.ts";
import { PaymentError } from "../src/lib/server/airbenda.ts";

const directory = mkdtempSync(join(tmpdir(), "forma-order-tests-"));
process.env.SHOP_DATABASE_PATH = join(directory, "orders.sqlite");
process.env.AIRBENDA_PUBLIC_KEY = "pk_test_fixture";
process.env.AIRBENDA_WEBHOOK_SECRET = "whsec_fixture";
const originalFetch = globalThis.fetch;
let counter = 0;
function id() {
  return (++counter).toString(16).padStart(24, "0");
}
after(() => {
  globalThis.fetch = originalFetch;
  getOrderStore().close();
  rmSync(directory, { recursive: true, force: true });
});

test("concurrent checkout requests create one gateway payment and store its identity privately", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.expected_amount_kobo, 10000);
    assert.equal(body.payment_type, "one_time");
    return Response.json(gatewayFixture({ id: id() }));
  };
  const [first, second] = await Promise.all([
    createOrder("same-session", checkoutInput),
    createOrder("same-session", checkoutInput),
  ]);
  assert.equal(calls, 1);
  assert.equal(first.id, second.id);
  const saved = currentOrder("same-session")!;
  assert.equal(saved.status, "pending");
  assert.ok(saved.sessionToken);
  const publicJson = JSON.stringify(publicOrder(saved));
  assert.ok(!publicJson.includes("sessionToken"));
  assert.ok(!publicJson.includes("test@example.com"));
  assert.ok(!publicJson.includes("sessionHash"));
  assert.equal(currentOrder("other-session"), null);
});
test("ambiguous initialization is retained and never retried automatically", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("network timeout");
  };
  await assert.rejects(
    createOrder("uncertain-session", checkoutInput),
    PaymentError,
  );
  assert.equal(currentOrder("uncertain-session")?.status, "uncertain");
  await createOrder("uncertain-session", checkoutInput);
  assert.equal(calls, 1);
  await assert.rejects(orderAction("uncertain-session", "new-order"));
});
test("payment reporting stays pending until a verified status read confirms full payment", async () => {
  const gatewayId = id();
  globalThis.fetch = async () =>
    Response.json(gatewayFixture({ id: gatewayId }));
  const order = await createOrder("verified-session", checkoutInput);
  let actionUrl = "";
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") actionUrl = String(url);
    return Response.json(gatewayFixture({ id: gatewayId }));
  };
  const reported = await orderAction("verified-session", "report-paid");
  assert.equal(reported?.status, "pending");
  assert.ok(actionUrl.includes("/report-paid?session_token="));
  globalThis.fetch = async () =>
    Response.json(
      gatewayFixture({
        id: gatewayId,
        status: "success",
        received_amount_kobo: 12400,
        remaining_amount_kobo: 0,
      }),
    );
  assert.equal((await refreshOrder(order, true)).status, "paid");
  globalThis.fetch = async () =>
    Response.json(gatewayFixture({ id: gatewayId }));
  assert.equal(
    (await refreshOrder(order, true)).status,
    "paid",
    "an older response must not undo success",
  );
});
test("part payments prevent cancellation and starting a replacement checkout", async () => {
  const gatewayId = id();
  globalThis.fetch = async () =>
    Response.json(gatewayFixture({ id: gatewayId }));
  const order = await createOrder("partial-session", checkoutInput);
  globalThis.fetch = async () =>
    Response.json(
      gatewayFixture({
        id: gatewayId,
        status: "partial",
        received_amount_kobo: 6000,
        remaining_amount_kobo: 6400,
      }),
    );
  await refreshOrder(order, true);
  await assert.rejects(orderAction("partial-session", "cancel"));
  await assert.rejects(orderAction("partial-session", "new-order"));
});
test("database survives reopening, keeps amounts, and records refunds without accepting stale success", () => {
  const path = join(directory, "persistence.sqlite"),
    input = parseOrderInput(checkoutInput);
  const first = new OrderStore(path),
    { order } = first.claim("browser-hash", input);
  const payment = parseGatewayPayment(
    gatewayFixture({
      id: id(),
      status: "success",
      received_amount_kobo: 12400,
      remaining_amount_kobo: 0,
    }),
    input,
  );
  first.savePayment(order.id, payment, "paid", "opaque_fixture_token");
  first.close();
  const second = new OrderStore(path);
  assert.equal(second.current("browser-hash")?.totalKobo, 10000);
  second.savePayment(order.id, { ...payment, status: "refunded" }, "refunded");
  second.savePayment(order.id, payment, "paid");
  assert.equal(second.get(order.id)?.status, "refunded");
  second.close();
});
