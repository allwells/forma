import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { OrderInput, PublicOrder } from "../payments.ts";

export type CheckoutRecord = PublicOrder &
  Pick<OrderInput, "network" | "channel"> & {
    sessionToken: string | null;
    updatedAt: string;
  };
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
function key(secret: string) {
  return createHash("sha256").update(`forma-checkout-v1:${secret}`).digest();
}
export function createCheckoutRecord(input: OrderInput): CheckoutRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    reference: `FM-${randomUUID().slice(0, 8).toUpperCase()}`,
    items: input.items,
    network: input.network,
    channel: input.channel,
    deliveryKobo: input.deliveryKobo,
    totalKobo: input.totalKobo,
    status: "creating",
    payment: null,
    sessionToken: null,
    createdAt: now,
    updatedAt: now,
  };
}
export function publicOrder(record: CheckoutRecord): PublicOrder {
  const {
    id,
    reference,
    status,
    items,
    deliveryKobo,
    totalKobo,
    createdAt,
    payment,
  } = record;
  return {
    id,
    reference,
    status,
    items,
    deliveryKobo,
    totalKobo,
    createdAt,
    payment,
  };
}
export function sealCheckoutRecord(
  record: CheckoutRecord,
  browserSession: string,
  secret: string,
) {
  if (!secret) throw new Error("Checkout encryption is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(browserSession));
  const plain = JSON.stringify({
    version: 1,
    expires: Date.parse(record.createdAt) + LIFETIME_MS,
    order: record,
  });
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
  if (sealed.length > 3500)
    throw new Error("The order is too large to save in this checkout.");
  return sealed;
}
export function openCheckoutRecord(
  value: string | undefined,
  browserSession: string,
  secret: string,
): CheckoutRecord | null {
  if (
    !value ||
    !secret ||
    value.length > 3500 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    decipher.setAAD(Buffer.from(browserSession));
    const payload = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (
      payload.version !== 1 ||
      !Number.isFinite(payload.expires) ||
      payload.expires <= Date.now() ||
      !payload.order ||
      typeof payload.order.id !== "string" ||
      !Array.isArray(payload.order.items)
    )
      return null;
    return payload.order as CheckoutRecord;
  } catch {
    return null;
  }
}
