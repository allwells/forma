import { redirect } from "next/navigation";

export default function PaymentSuccessReturn() {
  // The return URL is not proof of payment. Checkout verifies the saved order.
  redirect("/checkout?return=success");
}
