import type { NextRequest } from "next/server";
import {
  paymentConfig,
  validWebhookSignature,
  PaymentError,
} from "@/lib/server/airbenda";
import { limitedBody, jsonResponse, errorResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const config = paymentConfig();
    if (!config.configured)
      throw new PaymentError("Webhook verification is not configured.", 503);
    const raw = await limitedBody(request, 64000);
    if (
      !validWebhookSignature(
        raw,
        request.headers.get("x-airbenda-signature"),
        config.webhookSecret!,
      )
    )
      throw new PaymentError("Invalid webhook signature.", 401);
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new PaymentError("Invalid webhook body.", 400);
    }
    const data = event?.data ?? event;
    const id = data?.transaction_id ?? data?._id ?? data?.id;
    if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id))
      throw new PaymentError("Missing transaction identity.", 400);
    // Acknowledge signed notifications. Browser checkout reads the authoritative status from Airbenda.
    // No customer order history or fulfillment database is maintained by this demo shop.
    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
