import { products, MAX_QUANTITY, type CartItem } from "./shop.ts";

export const PAYMENT_NETWORKS = [
  "MTN",
  "Airtel",
  "9Mobile",
  "T2 Mobile",
] as const;
export type PaymentNetwork = (typeof PAYMENT_NETWORKS)[number];
export type PaymentChannel = "DIRECT_AIRTIME" | "BANK_VTU";
export type OrderStatus =
  | "creating"
  | "uncertain"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";
export type OrderLine = CartItem & { name: string; unitPriceKobo: number };
export type Customer = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
};
export type OrderInput = {
  items: OrderLine[];
  customer: Customer;
  network: PaymentNetwork;
  channel: PaymentChannel;
  deliveryKobo: number;
  totalKobo: number;
};
export type Payment = {
  id: string;
  reference: string;
  status: string;
  receivingPhone: string;
  ussd: string | null;
  network: PaymentNetwork;
  channel: PaymentChannel;
  expectedKobo: number;
  airtimeKobo: number;
  serviceKobo: number;
  suffixKobo: number;
  totalKobo: number;
  receivedKobo: number;
  remainingKobo: number;
  expiresAt: string;
  serverTime: string;
};
export type PublicOrder = {
  id: string;
  reference: string;
  status: OrderStatus;
  items: OrderLine[];
  deliveryKobo: number;
  totalKobo: number;
  createdAt: string;
  payment: Payment | null;
};

export function parseOrderInput(value: unknown): OrderInput {
  if (!value || typeof value !== "object")
    throw new Error("Please check your checkout details.");
  const body = value as Record<string, unknown>;
  if (
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    body.items.length > products.length
  )
    throw new Error("Your bag is empty or invalid.");
  const seen = new Set<string>();
  const items = body.items.map((line) => {
    if (!line || typeof line !== "object")
      throw new Error("Please check the items in your bag.");
    const product = products.find((product) => product.id === line.productId);
    if (
      !product ||
      seen.has(product.id) ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY
    )
      throw new Error("Please check the items and quantities in your bag.");
    seen.add(product.id);
    return {
      productId: product.id,
      quantity: line.quantity as number,
      name: product.name,
      unitPriceKobo: product.price * 100,
    };
  });
  if (body.delivery !== "standard" && body.delivery !== "express")
    throw new Error("Choose a delivery method.");
  if (!PAYMENT_NETWORKS.includes(body.network as PaymentNetwork))
    throw new Error("Choose a supported mobile network.");
  if (body.channel !== "DIRECT_AIRTIME" && body.channel !== "BANK_VTU")
    throw new Error("Choose a payment method.");
  const raw = body.customer as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object")
    throw new Error("Please complete your contact and delivery details.");
  function field(key: string, max = 100) {
    const result = typeof raw![key] === "string" ? raw![key].trim() : "";
    if (!result || result.length > max)
      throw new Error(`Please enter a valid ${key}.`);
    return result;
  }
  const customer = {
    name: field("name"),
    email: field("email", 254),
    phone: field("phone", 24).replace(/[\s-]/g, ""),
    address: field("address", 200),
    city: field("city"),
    state: field("state"),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
    throw new Error("Please enter a valid email address.");
  if (!/^(?:0|234|\+234)\d{10}$/.test(customer.phone))
    throw new Error("Please enter a Nigerian phone number.");
  const deliveryKobo = body.delivery === "express" ? 1000 : 0;
  return {
    items,
    customer,
    network: body.network as PaymentNetwork,
    channel: body.channel,
    deliveryKobo,
    totalKobo: items.reduce(
      (total, line) => total + line.unitPriceKobo * line.quantity,
      deliveryKobo,
    ),
  };
}

function timestamp(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing payment expiry.");
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value}Z`;
  if (!Number.isFinite(Date.parse(normalized)))
    throw new Error("Invalid payment expiry.");
  return new Date(normalized).toISOString();
}
export function parseGatewayPayment(
  value: unknown,
  order: Pick<OrderInput, "totalKobo" | "network" | "channel">,
  expectedId?: string,
): Payment {
  if (!value || typeof value !== "object")
    throw new Error("Invalid payment response.");
  const body = value as Record<string, unknown>;
  function amount(key: string) {
    const value = body[key];
    if (!Number.isSafeInteger(value) || (value as number) < 0)
      throw new Error("Invalid payment amount.");
    return value as number;
  }
  if (
    typeof body.id !== "string" ||
    !/^[a-f0-9]{24}$/i.test(body.id) ||
    (expectedId && body.id !== expectedId)
  )
    throw new Error("Invalid payment identity.");
  if (
    body.network !== order.network ||
    (body.channel && body.channel !== order.channel) ||
    (body.payment_type && body.payment_type !== "one_time")
  )
    throw new Error("Payment details do not match the order.");
  const expectedKobo = amount("expected_amount_kobo"),
    airtimeKobo = amount("airtime_amount_kobo"),
    serviceKobo = amount("service_charge_kobo"),
    suffixKobo = amount("deduplication_suffix_kobo"),
    totalKobo = amount("total_to_pay_kobo"),
    receivedKobo = amount("received_amount_kobo"),
    remainingKobo = amount("remaining_amount_kobo");
  if (
    expectedKobo !== order.totalKobo ||
    airtimeKobo < expectedKobo ||
    totalKobo < expectedKobo ||
    totalKobo !== airtimeKobo + serviceKobo + suffixKobo ||
    remainingKobo !== Math.max(0, totalKobo - receivedKobo)
  )
    throw new Error("Payment totals do not match the order.");
  const receivingPhone =
    typeof body.receiving_phone_number === "string"
      ? body.receiving_phone_number.replace(/[\s-]/g, "")
      : "";
  if (receivingPhone && !/^(?:0|234|\+234)\d{10}$/.test(receivingPhone))
    throw new Error("Invalid receiving number.");
  const ussd =
    typeof body.ussd_code === "string" &&
    /^[*#0-9A-Za-z ]{1,100}$/.test(body.ussd_code)
      ? body.ussd_code
      : null;
  if (typeof body.status !== "string")
    throw new Error("Missing payment status.");
  const status = body.status.toLowerCase();
  if (["success", "completed"].includes(status) && receivedKobo < totalKobo)
    throw new Error("Payment has not been fully received.");
  return {
    id: body.id,
    reference:
      typeof body.reference === "string"
        ? body.reference.slice(0, 100)
        : body.id,
    status,
    receivingPhone,
    ussd,
    network: order.network,
    channel: order.channel,
    expectedKobo,
    airtimeKobo,
    serviceKobo,
    suffixKobo,
    totalKobo,
    receivedKobo,
    remainingKobo,
    expiresAt: timestamp(body.expires_at),
    serverTime: timestamp(body.server_time),
  };
}
export function paymentOrderStatus(payment: Payment): OrderStatus {
  if (["success", "completed"].includes(payment.status)) return "paid";
  if (["failed", "expired", "cancelled", "refunded"].includes(payment.status))
    return payment.status as OrderStatus;
  return "pending";
}
export const formatKobo = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: amount % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);

export type PaidCart = { items: CartItem[]; paidOrders: string[] };
export function completePaidCart(
  current: PaidCart,
  order: PublicOrder,
): PaidCart {
  if (order.status !== "paid" || current.paidOrders.includes(order.id))
    return current;
  return {
    items: current.items.flatMap((item) => {
      const purchased =
        order.items.find((line) => line.productId === item.productId)
          ?.quantity ?? 0;
      const remaining = item.quantity - purchased;
      return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
    }),
    paidOrders: [...current.paidOrders, order.id].slice(-100),
  };
}
