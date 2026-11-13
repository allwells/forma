import {
  parseGatewayPayment,
  paymentOrderStatus,
  parseOrderInput,
} from "../payments.ts";
import { gatewayRequest, initializePayment, paymentConfig, PaymentError } from "./airbenda.ts";
import {
  createCheckoutRecord,
  type CheckoutRecord,
} from "./checkout-record.ts";

export function currentOrder(record: CheckoutRecord | null) {
  if (
    record?.status === "creating" &&
    Date.now() - Date.parse(record.createdAt) > 45000
  )
    return { ...record, status: "uncertain" as const };
  return record;
}
export async function refreshOrder(order: CheckoutRecord) {
  if (!order.payment || !order.sessionToken) return currentOrder(order)!;
  const query = new URLSearchParams({ session_token: order.sessionToken });
  const value = await gatewayRequest(
    `/api/checkout/${encodeURIComponent(order.payment.id)}?${query}`,
  );
  try {
    return applyPayment(order, value);
  } catch {
    throw new PaymentError(
      "We couldn’t verify the latest payment status. Keep this checkout open and check again.",
    );
  }
}

function applyPayment(order: CheckoutRecord, value: unknown): CheckoutRecord {
  const original = order.payment!;
  const payment = parseGatewayPayment(value, order, original.id, paymentConfig().base);
  if (payment.reference !== original.reference || payment.totalKobo !== original.totalKobo ||
      payment.isDemo !== (original.isDemo ?? paymentConfig().publicKey?.startsWith("pk_test_"))) {
    throw new Error("Payment no longer matches the saved quote");
  }
  return {
    ...order,
    payment,
    status: paymentOrderStatus(payment),
    updatedAt: new Date().toISOString(),
  };
}
export function createOrder(
  record: CheckoutRecord | null,
  body: unknown,
): CheckoutRecord {
  if (record) return currentOrder(record)!;
  return createCheckoutRecord(parseOrderInput(body));
}
export async function startPayment(
  order: CheckoutRecord,
  body: unknown,
): Promise<CheckoutRecord> {
  if (order.payment || order.status !== "creating") return currentOrder(order)!;
  if (Date.now() - Date.parse(order.createdAt) > 45000)
    return { ...order, status: "uncertain" };
  let input;
  try {
    input = parseOrderInput(body);
  } catch (error) {
    throw new PaymentError(
      error instanceof Error
        ? error.message
        : "Please check your checkout details.",
      400,
    );
  }
  if (
    input.totalKobo !== order.totalKobo ||
    input.network !== order.network ||
    input.channel !== order.channel ||
    input.deliveryKobo !== order.deliveryKobo ||
    JSON.stringify(input.items) !== JSON.stringify(order.items)
  )
    throw new PaymentError(
      "Your bag changed. Please reload your saved checkout.",
      409,
    );
  try {
    const { payment, token } = await initializePayment(input);
    return {
      ...order,
      payment,
      sessionToken: token,
      status: paymentOrderStatus(payment),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof PaymentError && !error.uncertain)
      return {
        ...order,
        status: "failed",
        updatedAt: new Date().toISOString(),
      };
    return {
      ...order,
      status: "uncertain",
      updatedAt: new Date().toISOString(),
    };
  }
}
export async function orderAction(
  record: CheckoutRecord | null,
  action: string,
  senderPhoneInput?: unknown,
): Promise<CheckoutRecord | null> {
  let order = currentOrder(record);
  if (!order)
    throw new PaymentError("No saved order was found in this browser.", 404);
  if (action === "new-order") {
    if (order.payment) order = await refreshOrder(order);
    if (
      ["creating", "pending", "verifying", "uncertain"].includes(order.status) ||
      (order.payment &&
        order.payment.remainingKobo > 0 &&
        order.payment.receivedKobo > 0)
    )
      throw new PaymentError(
        "This payment needs to be resolved before starting another order.",
        409,
      );
    return null;
  }
  if (action === "refresh") return refreshOrder(order);
  if (!["cancel", "report-paid"].includes(action))
    throw new PaymentError("Unknown payment action.", 400);
  if (!order.payment || !order.sessionToken)
    throw new PaymentError("The payment isn’t ready for this action.", 409);
  order = await refreshOrder(order);
  if (action === "report-paid" && order.status !== "pending" && order.status !== "verifying") return order;
  if (action === "cancel" && order.status !== "pending") return order;
  if (action === "cancel" && order.payment!.receivedKobo > 0)
    throw new PaymentError(
      "A part payment has arrived. Please contact the shop before cancelling.",
      409,
    );
  const query = new URLSearchParams({ session_token: order.sessionToken! });
  let senderPhone: string | undefined;
  if (action === "report-paid" && senderPhoneInput != null && senderPhoneInput !== "") {
    senderPhone = typeof senderPhoneInput === "string" ? senderPhoneInput.trim().replace(/[\s-]/g, "") : "";
    if (!/^(?:0|234|\+234)[1-9]\d{9}$/.test(senderPhone))
      throw new PaymentError("Enter a valid Nigerian sender phone number.", 400);
  }
  const response = await gatewayRequest(
    `/api/checkout/${encodeURIComponent(order.payment!.id)}/${action}?${query}`,
    senderPhone ? { sender_phone: senderPhone } : {},
  );
  if (action === "report-paid") {
    try {
      return applyPayment(order, response);
    } catch {
      throw new PaymentError("We couldn’t verify the payment response. Check your payment status.");
    }
  }
  return refreshOrder(order);
}
