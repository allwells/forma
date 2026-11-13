import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import { checkoutInput, gatewayFixture } from "./payments.test.mts";
import {
  createOrder,
  currentOrder,
  startPayment,
  orderAction,
  refreshOrder,
} from "../src/lib/server/checkout-service.ts";
import {
  openCheckoutRecord,
  sealCheckoutRecord,
  publicOrder,
} from "../src/lib/server/checkout-record.ts";

const previousKey = process.env.AIRBENDA_PUBLIC_KEY;
const previousSecret = process.env.AIRBENDA_WEBHOOK_SECRET;
process.env.AIRBENDA_PUBLIC_KEY = "pk_test_fixture";
process.env.AIRBENDA_WEBHOOK_SECRET = "whsec_fixture";
const originalFetch = globalThis.fetch;
let counter = 0;
function id() {
  return (++counter).toString(16).padStart(24, "0");
}
after(() => {
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.AIRBENDA_PUBLIC_KEY;
  else process.env.AIRBENDA_PUBLIC_KEY = previousKey;
  if (previousSecret === undefined) delete process.env.AIRBENDA_WEBHOOK_SECRET;
  else process.env.AIRBENDA_WEBHOOK_SECRET = previousSecret;
});

test("checkout prepares a browser record before contacting Airbenda and omits customer details", () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("No gateway call is expected while preparing checkout");
  };
  const draft = createOrder(null, checkoutInput);
  assert.equal(calls, 0);
  assert.equal(draft.totalKobo, 10000);
  assert.equal(draft.status, "creating");
  assert.equal(createOrder(draft, checkoutInput), draft);
  assert.ok(!JSON.stringify(draft).includes("test@example.com"));
});
test("encrypted checkout records survive requests and reject other browsers, secrets and altered data", async () => {
  const gatewayId = id();
  globalThis.fetch = async () =>
    Response.json(gatewayFixture({ id: gatewayId }));
  const saved = await startPayment(
    createOrder(null, checkoutInput),
    checkoutInput,
  );
  const sealed = sealCheckoutRecord(
    saved,
    "browser-fixture",
    "signing-fixture",
  );
  const restored = openCheckoutRecord(
    sealed,
    "browser-fixture",
    "signing-fixture",
  );
  assert.equal(restored?.payment?.id, gatewayId);
  assert.equal(restored?.sessionToken, saved.sessionToken);
  assert.equal(
    openCheckoutRecord(sealed, "other-browser", "signing-fixture"),
    null,
  );
  assert.equal(
    openCheckoutRecord(sealed, "browser-fixture", "wrong-secret"),
    null,
  );
  assert.equal(
    openCheckoutRecord(
      `x${sealed.slice(1)}`,
      "browser-fixture",
      "signing-fixture",
    ),
    null,
  );
  const publicJson = JSON.stringify(publicOrder(saved));
  assert.ok(!publicJson.includes("sessionToken"));
  assert.ok(!publicJson.includes("test@example.com"));
});
test("expired checkout records cannot be restored", () => {
  const draft = {
    ...createOrder(null, checkoutInput),
    createdAt: "2000-01-01T00:00:00Z",
  };
  const sealed = sealCheckoutRecord(draft, "browser", "secret");
  assert.equal(openCheckoutRecord(sealed, "browser", "secret"), null);
});
test("initialization uses server totals and reuses a known transaction instead of creating another", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.expected_amount_kobo, 10000);
    assert.equal(body.customer_email, checkoutInput.customer.email);
    return Response.json(gatewayFixture({ id: id() }));
  };
  const order = await startPayment(
    createOrder(null, checkoutInput),
    checkoutInput,
  );
  assert.equal(order.status, "pending");
  assert.ok(order.sessionToken);
  await startPayment(order, checkoutInput);
  assert.equal(calls, 1);
});
test("an uncertain initialization is retained without automatic retries", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("network timeout");
  };
  const order = await startPayment(
    createOrder(null, checkoutInput),
    checkoutInput,
  );
  assert.equal(order.status, "uncertain");
  await startPayment(order, checkoutInput);
  assert.equal(calls, 1);
  await assert.rejects(orderAction(order, "new-order"));
  const interrupted = {
    ...createOrder(null, checkoutInput),
    createdAt: new Date(Date.now() - 60000).toISOString(),
  };
  assert.equal(currentOrder(interrupted)?.status, "uncertain");
});
test("the prepared order cannot initialize a payment using different items", async () => {
  const draft = createOrder(null, checkoutInput);
  await assert.rejects(
    startPayment(draft, {
      ...checkoutInput,
      items: [{ productId: "wild-stems", quantity: 1 }],
    }),
  );
});
test("reporting stays pending until Airbenda confirms funds; subsequent reads also reflect refunds", async () => {
  const gatewayId = id();
  globalThis.fetch = async () =>
    Response.json(gatewayFixture({ id: gatewayId }));
  const order = await startPayment(
    createOrder(null, checkoutInput),
    checkoutInput,
  );
  let actionUrl = "";
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") actionUrl = String(url);
    return Response.json(gatewayFixture({ id: gatewayId }));
  };
  assert.equal((await orderAction(order, "report-paid"))?.status, "pending");
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
  const paid = await refreshOrder(order);
  assert.equal(paid.status, "paid");
  globalThis.fetch = async () =>
    Response.json(
      gatewayFixture({
        id: gatewayId,
        status: "refunded",
        received_amount_kobo: 12400,
        remaining_amount_kobo: 0,
      }),
    );
  assert.equal((await refreshOrder(paid)).status, "refunded");
});
test("part payments prevent cancellation and replacement checkout", async () => {
  const gatewayId = id();
  globalThis.fetch = async () =>
    Response.json(gatewayFixture({ id: gatewayId }));
  const order = await startPayment(
    createOrder(null, checkoutInput),
    checkoutInput,
  );
  globalThis.fetch = async () =>
    Response.json(
      gatewayFixture({
        id: gatewayId,
        status: "partial",
        received_amount_kobo: 6000,
        remaining_amount_kobo: 6400,
      }),
    );
  await assert.rejects(orderAction(order, "cancel"));
  await assert.rejects(orderAction(order, "new-order"));
});

test("expired checkout stays verifiable during grace and reports the corrected sender with the saved token", async () => {
  const gatewayId = id();
  globalThis.fetch = async () => Response.json(gatewayFixture({ id: gatewayId }));
  const order = await startPayment(createOrder(null, checkoutInput), checkoutInput);
  const grace = gatewayFixture({
    id: gatewayId, status: "expired", session_token: null,
    server_time: "2030-01-01T00:20:00Z", grace_expires_at: "2030-01-01T01:15:00Z",
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).searchParams.get("session_token"), order.sessionToken);
    if (init?.method !== "POST") return Response.json(grace);
    assert.match(String(url), /report-paid/);
    assert.deepEqual(JSON.parse(String(init.body)), { sender_phone: "+2348098765432" });
    return Response.json({
      ...grace, status: "success", received_amount_kobo: 12400, remaining_amount_kobo: 0,
      customer_email: checkoutInput.customer.email,
      receipt_url: `https://api.airbenda.com/api/checkout/${gatewayId}/receipt`,
    });
  };
  assert.equal((await refreshOrder(order)).status, "verifying");
  assert.equal((await orderAction(order, "cancel"))?.status, "verifying");
  await assert.rejects(orderAction(order, "new-order"));
  const paid = await orderAction(order, "report-paid", "+234 809 876 5432");
  assert.equal(paid?.status, "paid");
  assert.equal(paid?.sessionToken, order.sessionToken);
  assert.equal(paid?.payment?.receiptUrl, `https://api.airbenda.com/api/checkout/${gatewayId}/receipt?demo=true`);
  const reopened = openCheckoutRecord(sealCheckoutRecord(paid!, "browser", "secret"), "browser", "secret");
  assert.equal(reopened?.payment?.receiptEmail, undefined);
});
