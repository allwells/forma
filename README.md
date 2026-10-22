# Forma art shop

A small art storefront with Airbenda airtime checkout, built with Next.js, React and TypeScript. Products are a hardcoded list in `src/lib/shop.ts`: ten artworks priced between ₦30 and ₦50.

## Setup

Use Node.js 22 or newer and Bun to manage packages.

```sh
bun install
cp .env.example .env.local
bun run dev
```

Set `AIRBENDA_PUBLIC_KEY` and `AIRBENDA_WEBHOOK_SECRET` in `.env.local` for local development and in the Vercel project's environment variables for deployment. `AIRBENDA_API_BASE_URL` defaults to `https://api.airbenda.com`. Credentials stay on the server and must never use a `NEXT_PUBLIC_` prefix. The development server uses http://localhost:3003.

## Products and checkout state

There is no shop database and no runtime filesystem writing. Vercel functions do not provide durable writable JSON files, so the deployed app reads its product catalogue from the `.ts` file.

The cart is saved as JSON in the browser's localStorage. The current checkout is a JSON record encrypted with AES-256-GCM in an HttpOnly, SameSite cookie bound to that browser's checkout session. It expires after seven days. It holds the server-priced item snapshot, order reference and Airbenda transaction credentials. Contact and delivery details are not retained by the shop; customer name, email and payer number are submitted to Airbenda when initializing payment.

A draft cookie is saved before the separate request that initializes payment. The browser serializes checkout submissions across tabs using Web Locks when supported. Known transactions are reused, and uncertain initialization attempts are not automatically retried. Without gateway idempotency or central storage, the demo cannot guarantee exactly-once initialization across all concurrent clients. Clearing cookies or rotating the signing secret loses the browser's current checkout. Airbenda retains the payment record; the shop does not maintain a separate order history or shipping/fulfillment database.

Only Airbenda's verified current status can confirm payment. The shop validates the transaction ID, network, method, order amount, component totals and received balance. Reporting a transfer does not confirm payment. Partial payments prevent cancellation or replacement. Confirmed payment removes purchased quantities from the browser cart once, preserving later additions.

## Merchant settings

Production domain: `https://formalabs.vercel.app`.

- Success redirect: `https://formalabs.vercel.app/checkout/success`
- Cancel redirect: `https://formalabs.vercel.app/checkout/cancel`
- Confirmation webhook: `https://formalabs.vercel.app/api/airbenda/webhook`
- Partial-payment webhook: `https://formalabs.vercel.app/api/airbenda/webhook`

The redirect routes reopen the saved browser checkout and check payment status. Visiting a success URL cannot mark an order paid.

The webhook route verifies the HMAC-SHA256 signature over the raw body and acknowledges valid notifications. It does not keep a separate event/order store or trigger fulfillment. Browser polling and explicit status refresh read the authoritative transaction from Airbenda, including after returning to checkout. No Merchant settings are changed automatically.

## Scope

Supported deployed networks are MTN, Airtel, 9Mobile and T2 Mobile. Bank app / VTU means buying airtime for the receiving number, not making a bank transfer. Airbenda supplies the exact airtime total, charges, receiving number, expiry and any partial balance.

Artwork, artist credits, delivery estimates and inventory are sample content. This app does not send order emails or arrange shipping. Payment uses the configured Airbenda account. The previously inspected Airbenda manual-approval endpoints need authentication hardening before real-money use.

## Main files

- `src/lib/shop.ts`: product list and cart rules.
- `src/lib/payments.ts`: checkout input and gateway amount validation.
- `src/lib/server/checkout-record.ts`: encrypted browser checkout record.
- `src/lib/server/checkout-service.ts`: payment creation, status, reporting and cancellation.
- `src/lib/server/airbenda.ts`: server-only gateway calls and webhook signatures.
- `src/app/api/checkout/`: checkout endpoints.
- `src/app/api/airbenda/webhook/route.ts`: signed notification receiver.
- `src/components/payment-checkout.tsx`: payment instructions and confirmation UI.

Existing automated checks are retained in `tests/`. They use mocked gateway responses and encrypted checkout records. Tests, builds and UI checks are left to the user when requested.
