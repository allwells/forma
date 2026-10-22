import type { NextRequest } from "next/server";
import {
  currentOrder,
  orderAction,
  startPayment,
} from "@/lib/server/checkout-service";
import { publicOrder } from "@/lib/server/checkout-record";
import {
  requireBrowserSession,
  checkoutRecord,
  saveCheckoutRecord,
  limitedJson,
  jsonResponse,
  errorResponse,
} from "@/lib/server/http";
import { PaymentError } from "@/lib/server/airbenda";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const session = requireBrowserSession(request),
      body = await limitedJson(request);
    if (typeof body?.action !== "string")
      throw new PaymentError("Choose a payment action.", 400);
    const previous = currentOrder(checkoutRecord(request, session));
    if (body.action === "initialize" && !previous)
      throw new PaymentError(
        "Please reload checkout before starting payment.",
        409,
      );
    const order =
      body.action === "initialize"
        ? await startPayment(previous!, body.input)
        : await orderAction(previous, body.action);
    return saveCheckoutRecord(
      jsonResponse({ order: order ? publicOrder(order) : null }),
      order,
      session,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
