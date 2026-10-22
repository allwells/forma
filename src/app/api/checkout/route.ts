import { type NextRequest } from "next/server";
import { paymentConfig, PaymentError } from "@/lib/server/airbenda";
import {
  createOrder,
  currentOrder,
  refreshOrder,
} from "@/lib/server/checkout-service";
import { publicOrder } from "@/lib/server/order-store";
import {
  checkoutSession,
  newCheckoutSession,
  jsonResponse,
  requireBrowserSession,
  limitedJson,
  errorResponse,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const existing = checkoutSession(request),
      session = existing || newCheckoutSession();
    let order = currentOrder(session),
      warning: string | null = null;
    if (order && order.status === "pending") {
      try {
        order = await refreshOrder(order);
      } catch {
        warning =
          "We couldn’t update your payment status. Your order is saved; please check again.";
      }
    }
    return jsonResponse(
      {
        configured: paymentConfig().configured,
        order: order ? publicOrder(order) : null,
        warning,
      },
      200,
      existing ? undefined : session,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const session = requireBrowserSession(request);
    if (!paymentConfig().configured)
      throw new PaymentError(
        "Airbenda payments are not configured yet. Please check back shortly.",
        503,
      );
    const body = await limitedJson(request);
    try {
      return jsonResponse({
        order: publicOrder(await createOrder(session, body)),
      });
    } catch (error) {
      if (
        !(error instanceof PaymentError) &&
        error instanceof Error &&
        /Please|Choose|Your bag/.test(error.message)
      )
        throw new PaymentError(error.message, 400);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
