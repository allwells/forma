import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PaymentError } from "./airbenda.ts";

const COOKIE = "forma-checkout-session";
export function checkoutSession(request: NextRequest) {
  const value = request.cookies.get(COOKIE)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function jsonResponse(data: unknown, status = 200, newSession?: string) {
  const response = NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
  if (newSession)
    response.cookies.set(COOKIE, newSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/checkout",
      maxAge: 60 * 60 * 24 * 7,
    });
  return response;
}
export const newCheckoutSession = () => randomBytes(32).toString("hex");
export function requireBrowserSession(request: NextRequest) {
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new PaymentError("Please reload checkout before trying again.", 403);
  const session = checkoutSession(request);
  if (!session)
    throw new PaymentError("Please reload checkout before trying again.", 401);
  return session;
}
export async function limitedJson(request: NextRequest, max = 16000) {
  const text = await limitedBody(request, max);
  try {
    return JSON.parse(text);
  } catch {
    throw new PaymentError("Invalid checkout request.", 400);
  }
}
export async function limitedBody(request: NextRequest, max: number) {
  if (Number(request.headers.get("content-length")) > max)
    throw new PaymentError("Request is too large.", 413);
  if (!request.body) return "";
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new PaymentError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function errorResponse(error: unknown) {
  return jsonResponse(
    {
      error:
        error instanceof PaymentError
          ? error.message
          : "We couldn’t complete this request. Your saved order is safe; please check again.",
    },
    error instanceof PaymentError ? error.status : 500,
  );
}
