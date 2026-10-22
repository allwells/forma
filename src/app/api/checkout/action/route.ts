import type { NextRequest } from "next/server";
import { orderAction } from "@/lib/server/checkout-service";
import { publicOrder } from "@/lib/server/order-store";
import {
  requireBrowserSession,
  limitedJson,
  jsonResponse,
  errorResponse,
} from "@/lib/server/http";
import { PaymentError } from "@/lib/server/airbenda";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const session = requireBrowserSession(request),
      body = await limitedJson(request, 1000);
    if (typeof body?.action !== "string")
      throw new PaymentError("Choose a payment action.", 400);
    const order = await orderAction(session, body.action);
    return jsonResponse({ order: order ? publicOrder(order) : null });
  } catch (error) {
    return errorResponse(error);
  }
}
