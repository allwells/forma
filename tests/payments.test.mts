import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import {
  completePaidCart,
  type PublicOrder,
  parseOrderInput,
  parseGatewayPayment,
  paymentOrderStatus,
} from "../src/lib/payments.ts";
import { validWebhookSignature } from "../src/lib/server/airbenda.ts";

export const checkoutInput = {
  items: [{ productId: "sunroom", quantity: 2, price: 1 }],
  delivery: "express",
  network: "MTN",
  channel: "DIRECT_AIRTIME",
  customer: {
    name: "Test Buyer",
    email: "test@example.com",
    phone: "+234 801 234 5678",
    address: "10 Fictional Street",
    city: "Lagos",
    state: "Lagos",
  },
  totalKobo: 1,
};
export function gatewayFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "0123456789abcdef01234567",
    reference: "chk_fixture",
    status: "pending",
    session_token: "opaque_fixture_token_123456789",
    expected_amount_kobo: 10000,
    airtime_amount_kobo: 11400,
    service_charge_kobo: 300,
    deduplication_suffix_kobo: 700,
    total_to_pay_kobo: 12400,
    received_amount_kobo: 0,
    remaining_amount_kobo: 12400,
    receiving_phone_number: "08012345678",
    ussd_code: "*321*1*08012345678*124*PIN#",
    network: "MTN",
    channel: "DIRECT_AIRTIME",
    payment_type: "one_time",
    expires_at: "2030-01-01T00:15:00",
    server_time: "2030-01-01T00:00:00Z",
    ...overrides,
  };
}

test("server derives catalogue prices, quantities and delivery; ignores submitted totals", () => {
  const input = parseOrderInput(checkoutInput);
  assert.equal(input.totalKobo, 10000);
  assert.equal(input.items[0].unitPriceKobo, 4500);
  assert.equal(input.customer.phone, "+2348012345678");
});
test("server rejects duplicate products, bad quantities, unsupported networks and invalid contact", () => {
  assert.throws(() =>
    parseOrderInput({
      ...checkoutInput,
      items: [...checkoutInput.items, ...checkoutInput.items],
    }),
  );
  for (const quantity of [0, -1, 1.5, 11, "2"])
    assert.throws(() =>
      parseOrderInput({
        ...checkoutInput,
        items: [{ productId: "sunroom", quantity }],
      }),
    );
  assert.throws(() => parseOrderInput({ ...checkoutInput, network: "Glo" }));
  assert.throws(() => parseOrderInput({ ...checkoutInput, delivery: "free" }));
  assert.throws(() =>
    parseOrderInput({
      ...checkoutInput,
      customer: { ...checkoutInput.customer, phone: "123456" },
    }),
  );
});
test("gateway validation preserves exact kobo and requires fully received funds for success", () => {
  const input = parseOrderInput(checkoutInput);
  const payment = parseGatewayPayment(gatewayFixture(), input);
  assert.equal(paymentOrderStatus(payment), "pending");
  assert.equal(payment.expiresAt, "2030-01-01T00:15:00.000Z");
  assert.throws(() =>
    parseGatewayPayment(gatewayFixture({ status: "success" }), input),
  );
  const paid = parseGatewayPayment(
    gatewayFixture({
      status: "success",
      received_amount_kobo: 12500,
      remaining_amount_kobo: 0,
    }),
    input,
  );
  assert.equal(paymentOrderStatus(paid), "paid");
  assert.equal(paid.receivedKobo, 12500);
});
test("gateway rejects tampered amounts, identities, methods and receiving numbers", () => {
  const input = parseOrderInput(checkoutInput);
  for (const fields of [
    { expected_amount_kobo: 1 },
    { total_to_pay_kobo: 1 },
    { service_charge_kobo: -100 },
    { remaining_amount_kobo: 10 },
    { network: "Glo" },
    { channel: "BANK_VTU" },
    { receiving_phone_number: "https://bad.example" },
  ])
    assert.throws(() => parseGatewayPayment(gatewayFixture(fields), input));
  assert.throws(() =>
    parseGatewayPayment(gatewayFixture(), input, "abcdef0123456789abcdef01"),
  );
  assert.equal(
    parseGatewayPayment(
      gatewayFixture({ ussd_code: "javascript:alert(1)" }),
      input,
    ).ussd,
    null,
  );
});
test("webhook verification uses the exact raw bytes and rejects missing or forged signatures", () => {
  const raw = '{"event":"payment.success","data":{"transaction_id":"test"}}';
  const secret = "fixture-webhook-secret";
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(validWebhookSignature(raw, signature, secret), true);
  assert.equal(validWebhookSignature(`${raw}\n`, signature, secret), false);
  assert.equal(validWebhookSignature(raw, "f".repeat(64), secret), false);
  assert.equal(validWebhookSignature(raw, null, secret), false);
});

test("only paid orders remove purchased quantities, once, while keeping later additions", () => {
  const cart = {
    items: [
      { productId: "sunroom", quantity: 3 },
      { productId: "wild-stems", quantity: 1 },
    ],
    paidOrders: [] as string[],
  };
  const input = parseOrderInput(checkoutInput);
  const order: PublicOrder = {
    id: "order-fixture",
    reference: "FM-FIXTURE",
    status: "pending",
    items: input.items,
    deliveryKobo: input.deliveryKobo,
    totalKobo: input.totalKobo,
    payment: null,
    createdAt: new Date().toISOString(),
  };
  assert.equal(completePaidCart(cart, order), cart);
  const paid = { ...order, status: "paid" as const };
  const next = completePaidCart(cart, paid);
  assert.deepEqual(next.items, [
    { productId: "sunroom", quantity: 1 },
    { productId: "wild-stems", quantity: 1 },
  ]);
  assert.equal(completePaidCart(next, paid), next);
});
