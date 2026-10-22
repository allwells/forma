import { redirect } from "next/navigation";

export default function PaymentCancelReturn() {
  // Preserve the cart and let checkout recover the gateway's actual status.
  redirect("/checkout?return=cancel");
}
