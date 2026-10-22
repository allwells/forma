import type { NextRequest } from "next/server";
import {
  paymentConfig,
  validWebhookSignature,
  PaymentError,
} from "@/lib/server/airbenda";
import { getOrderStore } from "@/lib/server/order-store";
import { refreshOrder } from "@/lib/server/checkout-service";
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
    const order = getOrderStore().byGateway(id);
    // Out-of-order events and retries are safe: only Airbenda's current status can update the order.
    if (order) {
      try {
        await refreshOrder(order, true);
      } catch {
        throw new PaymentError("Please retry this notification.", 503);
      }
    }
    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
