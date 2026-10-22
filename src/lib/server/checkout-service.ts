import { createHash } from "node:crypto";
import {
  parseGatewayPayment,
  paymentOrderStatus,
  parseOrderInput,
} from "../payments.ts";
import { gatewayRequest, initializePayment, PaymentError } from "./airbenda.ts";
import { getOrderStore, type StoredOrder } from "./order-store.ts";

export const sessionHash = (session: string) =>
  createHash("sha256").update(session).digest("hex");
export function currentOrder(session: string) {
  const store = getOrderStore();
  const order = store.current(sessionHash(session));
  if (
    order?.status === "creating" &&
    Date.now() - Date.parse(order.createdAt) > 45000
  )
    return store.update(order.id, { status: "uncertain" });
  return order;
}
export async function refreshOrder(order: StoredOrder, force = false) {
  if (!order.payment || !order.sessionToken) return order;
  if (!force && Date.now() - Date.parse(order.updatedAt) < 4000) return order;
  const query = new URLSearchParams({ session_token: order.sessionToken });
  const value = await gatewayRequest(
    `/api/checkout/${encodeURIComponent(order.payment.id)}?${query}`,
  );
  let payment;
  try {
    payment = parseGatewayPayment(value, order, order.payment.id);
  } catch {
    throw new PaymentError(
      "We couldn’t verify the latest payment status. Your order is still saved; please check again.",
    );
  }
  return getOrderStore().savePayment(
    order.id,
    payment,
    paymentOrderStatus(payment),
  );
}
export async function createOrder(session: string, body: unknown) {
  const store = getOrderStore();
  const input = parseOrderInput(body);
  const { order, created } = store.claim(sessionHash(session), input);
  if (!created) return order;
  try {
    const { payment, token } = await initializePayment(input);
    return store.savePayment(
      order.id,
      payment,
      paymentOrderStatus(payment),
      token,
    );
  } catch (error) {
    store.update(order.id, {
      status:
        error instanceof PaymentError && !error.uncertain
          ? "failed"
          : "uncertain",
    });
    throw error;
  }
}
export async function orderAction(session: string, action: string) {
  const store = getOrderStore();
  let order = currentOrder(session);
  if (!order) throw new PaymentError("No saved order was found.", 404);
  if (action === "new-order") {
    if (order.payment) order = await refreshOrder(order, true);
    if (
      ["creating", "pending", "uncertain"].includes(order.status) ||
      (order.payment &&
        order.payment.remainingKobo > 0 &&
        order.payment.receivedKobo > 0)
    )
      throw new PaymentError(
        "This payment needs to be resolved before starting another order.",
        409,
      );
    store.update(order.id, { archived: true });
    return null;
  }
  if (action === "refresh") return refreshOrder(order, true);
  if (!["cancel", "report-paid"].includes(action))
    throw new PaymentError("Unknown payment action.", 400);
  if (!order.payment || !order.sessionToken)
    throw new PaymentError("The payment isn’t ready for this action.", 409);
  order = await refreshOrder(order, true);
  if (order.status !== "pending") return order;
  if (action === "cancel" && order.payment!.receivedKobo > 0)
    throw new PaymentError(
      "A part payment has arrived. Please contact the shop before cancelling.",
      409,
    );
  const query = new URLSearchParams({ session_token: order.sessionToken! });
  await gatewayRequest(
    `/api/checkout/${encodeURIComponent(order.payment!.id)}/${action}?${query}`,
    {},
  );
  return refreshOrder(order, true);
}
