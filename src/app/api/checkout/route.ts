import { type NextRequest } from "next/server";
import { paymentConfig, PaymentError } from "@/lib/server/airbenda";
import {
  createOrder,
  currentOrder,
  refreshOrder,
} from "@/lib/server/checkout-service";
import { publicOrder } from "@/lib/server/checkout-record";
import {
  checkoutSession,
  checkoutRecord,
  saveCheckoutRecord,
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
    let order = currentOrder(checkoutRecord(request, session)),
      warning: string | null = null;
    if (order?.payment) {
      try {
        order = await refreshOrder(order);
      } catch {
        warning =
          "We couldn’t update payment status. Keep this checkout open and check again.";
      }
    }
    // Reads do not rewrite the order cookie, so a slow poll cannot overwrite a newer payment response.
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
    let order;
    try {
      order = createOrder(checkoutRecord(request, session), body);
    } catch (error) {
      if (error instanceof Error && !(error instanceof PaymentError))
        throw new PaymentError(error.message, 400);
      throw error;
    }
    // Save the draft in the browser before the separate payment initialization request.
    return saveCheckoutRecord(
      jsonResponse({ order: publicOrder(order) }),
      order,
      session,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
