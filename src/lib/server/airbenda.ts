import { createHmac, timingSafeEqual } from "node:crypto";
import { parseGatewayPayment, type OrderInput } from "../payments.ts";

export class PaymentError extends Error {
  status: number;
  uncertain: boolean;
  constructor(message: string, status = 502, uncertain = false) {
    super(message);
    this.status = status;
    this.uncertain = uncertain;
  }
}
export function paymentConfig() {
  const publicKey = process.env.AIRBENDA_PUBLIC_KEY?.trim();
  const webhookSecret = process.env.AIRBENDA_WEBHOOK_SECRET?.trim();
  const base = new URL(
    process.env.AIRBENDA_API_BASE_URL || "https://api.airbenda.com",
  );
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new PaymentError(
      "The payment service is not configured correctly.",
      503,
    );
  const configured =
    !!publicKey &&
    !!webhookSecret &&
    !/YOUR_|REPLACE_|placeholder/i.test(`${publicKey} ${webhookSecret}`);
  return { publicKey, webhookSecret, base: base.origin, configured };
}
export async function gatewayRequest(
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const config = paymentConfig();
  if (!config.configured)
    throw new PaymentError(
      "Airbenda payments are not configured yet. Please check back shortly.",
      503,
    );
  try {
    const response = await fetch(`${config.base}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new PaymentError(
        response.status === 404
          ? "Airbenda couldn’t find this merchant or payment. Please contact the shop."
          : response.status === 429
            ? "Airbenda is busy. Please wait before checking again."
            : "Airbenda couldn’t complete this request. Please check your payment status before trying again.",
        502,
        !!body &&
          (response.status >= 500 ||
            response.status === 408 ||
            response.status === 429),
      );
    return await response.json();
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(
      "We couldn’t reach Airbenda. Check your payment status before starting another payment.",
      502,
      !!body,
    );
  }
}
export async function initializePayment(input: OrderInput) {
  const value = await gatewayRequest("/api/checkout/initialize", {
    merchant_id: paymentConfig().publicKey,
    expected_amount_kobo: input.totalKobo,
    network: input.network,
    phone_number: input.customer.phone,
    whatsapp_number: input.customer.phone,
    customer_name: input.customer.name,
    customer_email: input.customer.email,
    channel: input.channel,
    payment_type: "one_time",
  });
  try {
    const payment = parseGatewayPayment(value, input);
    const token = (value as Record<string, unknown>).session_token;
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,512}$/.test(token))
      throw new Error("Missing payment token");
    return { payment, token };
  } catch {
    throw new PaymentError(
      "Airbenda returned payment details we couldn’t verify. Please contact the shop with your order reference.",
      502,
      true,
    );
  }
}
export function validWebhookSignature(
  raw: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    createHmac("sha256", secret).update(raw).digest(),
  );
}
