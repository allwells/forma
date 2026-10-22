# Forma art shop

A small art storefront with Airbenda airtime payments, built with Next.js, React, and TypeScript. All integration code lives in `airbenda/shop`; Merchant, Checkout, and the Airbenda backend do not need feature changes.

## Local setup

Use **Node.js 22.13 or newer** and Bun to manage packages.

```sh
bun install
cp .env.example .env.local
# Set the merchant public key and webhook signing secret in .env.local.
bun run dev
```

Open http://localhost:3003. Never prefix payment credentials with `NEXT_PUBLIC_`. Both key and signing secret are required; missing configuration disables payment creation. `.env.local` and `.data/` are ignored by Git. Use one shop merchant account so its confirmation and partial-payment webhooks point to this shop.

```sh
bun run typecheck
bun run test
bun run build
bun run start
```

Tests replace the gateway network boundary with fixtures. They never create live Airbenda payments. Never use real customer information in tests.

## Checkout flow

1. The shop validates product IDs, integer quantities, Nigerian phone numbers, network and delivery details on its server. Prices come from the hardcoded catalogue, never from submitted totals.
2. A pending order and its item/price snapshot are saved before calling `POST /api/checkout/initialize`. The returned Airbenda transaction ID, reference and opaque session token are saved against that order.
3. The customer sees Airbenda's exact airtime amount, receiving number, transfer instructions, charges, expiry and any partial balance. Supported deployed networks are MTN, Airtel, 9Mobile and T2 Mobile. Bank app / VTU means buying airtime for the receiving number, not sending money to a bank account.
4. The shop checks `GET /api/checkout/{tx_id}`. Reporting a transfer is not proof of payment. Success requires a verified matching transaction, order amount, network, method, component totals and fully received funds.
5. Only confirmed payment removes purchased quantities from the bag. A single persisted cart record tracks processed order IDs so refreshing the receipt does not remove items again. Changes added to the bag after an order was created remain in the bag.

An HttpOnly, SameSite cookie scopes access to the current order. Customer contact and delivery information and gateway session tokens stay server-side. Mutating checkout requests require a matching Origin and JSON content type. Public order responses omit contact information and access tokens. API responses are not cached.

## Webhooks and deployment

Set both **Confirmation URL** and **Partial payment alert** in the existing Airbenda Merchant settings to:

```text
https://formalabs.vercel.app/api/airbenda/webhook
```

The intended public domain is `https://formalabs.vercel.app`. Configure the existing Merchant checkout redirects as:

- Success: `https://formalabs.vercel.app/checkout/success`
- Cancel: `https://formalabs.vercel.app/checkout/cancel`

Both routes return to checkout, which loads the saved order and verifies its payment status. Visiting a success URL cannot mark an order paid, and a cancel return never clears the bag.

Use the same merchant's webhook signing secret in `AIRBENDA_WEBHOOK_SECRET`. The route verifies a hex HMAC-SHA256 of the exact raw request body against `x-airbenda-signature`, then re-reads the saved transaction from Airbenda. It handles both typed event envelopes and legacy transaction bodies. Duplicate or out-of-order events cannot create orders or fulfill them twice. A webhook arriving before transaction mapping completes is harmless; browser polling also reconciles the order. Transient verification failures return 503 so Airbenda can retry.

Localhost is not reachable by Airbenda's webhook sender. Deploy the shop to a public HTTPS URL before configuring Merchant webhooks. Browser polling works while the checkout page remains open. No webhook settings are changed by this repository.

The shop server needs network access to `https://api.airbenda.com`.

## Recovery and production prerequisites

- Duplicate submissions from the same checkout session reuse the saved attempt. An initialization timeout, unknown gateway response or server restart during initialization becomes **uncertain**; it is never automatically retried. Resolve it with Airbenda using the shop reference and merchant transaction records before manually retiring it. There is deliberately no browser button that discards an uncertain attempt.
- Pending orders and partially received airtime cannot be replaced. Cancellation is refused after any funds arrive. An expired/failed order with partial funds directs the customer to support. Always check payment status before creating a replacement.
- Webhooks trigger canonical API verification, and stale pending responses cannot undo an already verified paid/refunded state. No fulfillment/email/shipping automation is implemented. If adding those later, use a durable idempotent fulfillment job keyed by the order ID.
- The inspected Airbenda deployment publishes manual approval/rejection endpoints without authentication requirements in its schema. Resolve that backend security issue before accepting real payments. This shop integration does not change those backend handlers.
- Actual ₦30–₦50 acceptance, current merchant/network rates, receiving-SIM availability, real settlement and outbound signed webhook delivery still require a controlled integration test. The shop displays returned charges rather than hardcoding a fee estimate.

## Main files

- `src/lib/shop.ts`: ten hardcoded ₦30–₦50 artworks and cart rules.
- `src/lib/payments.ts`: server input validation and gateway monetary checks.
- `src/lib/server/order-store.ts`: durable order snapshots and state updates.
- `src/lib/server/checkout-service.ts`: creation, polling, reporting and cancellation.
- `src/lib/server/airbenda.ts`: server-only gateway calls and signature verification.
- `src/app/api/checkout/`: private shop checkout endpoints.
- `src/app/api/airbenda/webhook/route.ts`: signed payment notification receiver.
- `src/components/payment-checkout.tsx`: instructions, partial-payment and confirmation screens.

The artwork, artist credits, products and delivery estimates remain sample content. Payment uses the configured Airbenda account; it is not a simulated gateway.
