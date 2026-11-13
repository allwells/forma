"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatKobo, type PublicOrder } from "@/lib/payments";
import { products } from "@/lib/shop";
import { Artwork } from "./artwork";
import { Icon } from "./icons";

export function PaymentCheckout({
  order,
  error,
  onError,
  onOrder,
  onActing,
  statusUnavailable,
}: {
  order: PublicOrder;
  error: string;
  onError: (error: string) => void;
  onOrder: (order: PublicOrder | null) => void;
  onActing: (pending: boolean) => void;
  statusUnavailable: boolean;
}) {
  const [busy, setBusy] = useState("");
  const inFlight = useRef(false);
  const [senderPhone, setSenderPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const payment = order.payment;
  useEffect(() => {
    if (!payment) return;
    const deadline =
      Date.now() +
      Date.parse(payment.expiresAt) -
      Date.parse(payment.serverTime);
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [payment?.expiresAt, payment?.serverTime]);
  async function action(name: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    onActing(true);
    setBusy(name);
    onError("");
    setNotice("");
    try {
      const response = await fetch("/api/checkout/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name, ...(name === "report-paid" && senderPhone.trim() ? { senderPhone } : {}) }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "We couldn’t update this payment. Please check again.",
        );
      onOrder(data.order);
      if (name === "report-paid" && ["pending", "verifying"].includes(data.order?.status))
        setNotice(
          "Transfer reported. Airbenda is checking for your airtime.",
        );
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "We couldn’t update payment. Please check again.",
      );
    } finally {
      inFlight.current = false;
      onActing(false);
      setBusy("");
    }
  }
  const paid = order.status === "paid" && !statusUnavailable;
  const verifying = order.status === "verifying";
  const canSend = !statusUnavailable && order.status === "pending" && seconds > 0 && !!payment?.receivingPhone;
  const unresolved =
    order.status === "creating" || order.status === "uncertain";
  const terminal = ["cancelled", "expired", "failed", "refunded"].includes(
    order.status,
  );
  const partial =
    !!payment && payment.receivedKobo > 0 && payment.remainingKobo > 0;
  const headings = {
    creating: "Getting your payment ready.",
    uncertain: "Let’s check before you pay.",
    pending: partial ? "A little more to go." : "One last little step.",
    paid: payment?.isDemo ? "Test payment confirmed." : "You have great taste.",
    verifying: "We’re confirming your transfer.",
    cancelled: "Your payment was cancelled.",
    expired: "The payment window has ended.",
    failed: "This payment didn’t complete.",
    refunded: "This payment was refunded.",
  };
  return (
    <main className="payment-shell shell">
      <Link href="/#collection" className="back-link">
        ← Back to the collection
      </Link>
      <span className="eyebrow">
        {paid
          ? payment?.isDemo ? "TEST PAYMENT CONFIRMED" : "PAYMENT CONFIRMED BY AIRBENDA"
          : "YOUR CHECKOUT IS SAVED IN THIS BROWSER"}
      </span>
      <h1>{headings[order.status]}</h1>
      <p className="checkout-intro">
        Order {order.reference}
        {payment ? ` · Airbenda ${payment.reference}` : ""}
      </p>
      <div className="payment-grid">
        <section className="payment-panel">
          {statusUnavailable ? (
            <div className="demo-notice">
              <Icon name="bag" />
              <p><strong>Check the latest payment status</strong>Keep this checkout open while Airbenda’s payment status is unavailable.</p>
            </div>
          ) : paid ? (
            <div className="payment-success">
              <div className="success-icon">
                <Icon name="check" width="30" height="30" />
              </div>
              <h2>{payment?.isDemo ? "Simulated payment received." : "Payment received."}</h2>
              <p>
                Airbenda has confirmed your payment of{" "}
                {formatKobo(payment!.receivedKobo)}. Your order is saved with
                the reference above.
              </p>
              {payment?.isDemo ? (
                <p className="muted">No real airtime or money moved for this order.</p>
              ) : payment?.receiptEmail && (
                <p className="muted">Airbenda will send your receipt to {payment.receiptEmail}.</p>
              )}
              {payment?.receiptUrl && (
                <a className="button secondary" href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                  View or download receipt
                </a>
              )}
            </div>
          ) : unresolved ? (
            <div className="demo-notice">
              <Icon name="bag" />
              <p>
                <strong>
                  {order.status === "creating"
                    ? "Creating your Airbenda payment"
                    : "The payment response could not be confirmed"}
                </strong>
                {order.status === "creating"
                  ? "Please keep this page open. Your order will update when payment instructions are ready."
                  : "Please do not start or send another payment. Contact the shop with your order reference so this attempt can be checked."}
              </p>
            </div>
          ) : terminal ? (
            <div className="demo-notice">
              <Icon name="bag" />
              <p>
                <strong>
                  {partial
                    ? "A part payment needs attention"
                    : "Your artwork is still in your bag"}
                </strong>
                {partial
                  ? "Some airtime was received. Please contact the shop with your Airbenda reference before starting another payment."
                  : order.status === "refunded"
                    ? "Please contact the shop about this refund and any delivery arrangements."
                    : "Don’t transfer airtime to these old instructions. You can start a new payment when you’re ready."}
              </p>
            </div>
          ) : (
            payment && (
              <>
                <div className="payment-status">
                  <span className="status-dot" />
                  {verifying ? "Confirming with the carrier" : partial ? "Part payment received" : "Awaiting your airtime"}
                  <span>
                    {verifying ? "Still checking" : seconds > 0
                      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining`
                      : "Window ended — checking status"}
                  </span>
                </div>
                {canSend ? (
                  <>
                    {payment.isDemo && <p className="payment-notice">Test payment. Do not send real airtime.</p>}
                    {partial && (
                      <p className="payment-notice" role="status">
                        Airbenda received {formatKobo(payment.receivedKobo)}. The remaining balance is {formatKobo(payment.remainingKobo)}.
                      </p>
                    )}
                    <span className="eyebrow">
                      {partial
                        ? "REMAINING AIRTIME TO SEND"
                        : "SEND THIS EXACT AIRTIME AMOUNT"}
                    </span>
                    <div className="airtime-total">
                      {formatKobo(payment.remainingKobo)}
                      <button className="text-button" type="button" onClick={async () => {
                        try {
                          const amount = payment.remainingKobo / 100;
                          await navigator.clipboard.writeText(String(amount));
                          setNotice("Transfer amount copied.");
                        } catch {
                          setNotice("Copy is unavailable. Use the amount shown above.");
                        }
                      }}>Copy amount</button>
                    </div>
                    <div className="receiving-number">
                      <span>{payment.network} receiving number</span>
                      <strong>{payment.receivingPhone}</strong>
                      <button
                        className="text-button"
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              payment.receivingPhone,
                            );
                            setNotice("Receiving number copied.");
                          } catch {
                            setNotice(
                              "Copy is unavailable. Select the receiving number above.",
                            );
                          }
                        }}
                      >
                        Copy number
                      </button>
                    </div>
                    {payment.channel === "BANK_VTU" ? (
                      <p className="payment-instructions">
                        In your bank app or VTU service, choose{" "}
                        <strong>Buy airtime</strong>, select {payment.network},
                        and recharge the receiving number above with exactly{" "}
                        <strong>{formatKobo(payment.remainingKobo)}</strong>.
                        This is an airtime recharge, not a bank transfer.
                      </p>
                    ) : (
                      <>
                        <p className="payment-instructions">
                          Transfer airtime from the {payment.network} number you
                          entered at checkout to the receiving number above.
                          Send the exact amount so Airbenda can match your
                          payment.
                        </p>
                        {payment.ussd && (
                          <div className="ussd-code">
                            <span>USSD transfer guide</span>
                            <code>{payment.ussd}</code>
                            <small>
                              Replace PIN with your airtime transfer PIN on your
                              phone. Never enter your PIN on this shop.
                            </small>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <div className="demo-notice">
                    <Icon name="bag" />
                    <p>
                      <strong>{verifying ? "Airbenda is still looking for your transfer" : "Check payment status before continuing"}</strong>
                      {verifying
                        ? "Carrier confirmation can take a few minutes. If you already paid, enter the sender number below to help Airbenda find the transfer."
                        : !payment.receivingPhone
                        ? "Airbenda hasn’t supplied a receiving number. Don’t send airtime until verified instructions are available."
                        : "The displayed transfer window has ended. Don’t send more airtime using these instructions; check the latest status or contact the shop."}
                    </p>
                  </div>
                )}
                {(verifying || canSend) && (
                  <>
                    {verifying && (
                      <label className="form-fields payment-sender">
                        Sender phone number (optional)
                        <input type="tel" autoComplete="tel" placeholder="0801 234 5678"
                          value={senderPhone} maxLength={24} disabled={!!busy}
                          onChange={(event) => setSenderPhone(event.target.value)} />
                      </label>
                    )}
                    <button type="button" className="button primary full-width" disabled={!!busy}
                      onClick={() => action("report-paid")}>
                      {busy === "report-paid" ? "Checking transfer…" : verifying ? "Check my payment now"
                        : partial ? "I’ve transferred the balance" : "I’ve sent the airtime"}
                      <Icon name="arrow" />
                    </button>
                  </>
                )}
                <p className="summary-footnote">
                  Reporting a transfer does not confirm payment. Airbenda
                  verifies airtime received.
                </p>
              </>
            )
          )}
          {notice && (
            <p className="payment-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="payment-actions">
            {!paid && (
              <button
                type="button"
                className="button secondary"
                disabled={!!busy}
                onClick={() => action("refresh")}
              >
                {busy === "refresh" ? "Checking…" : "Check payment status"}
              </button>
            )}
            {!statusUnavailable && order.status === "pending" && seconds > 0 && !partial && (
              <button
                type="button"
                className="text-button"
                disabled={!!busy}
                onClick={() => action("cancel")}
              >
                {busy === "cancel" ? "Cancelling…" : "Cancel payment"}
              </button>
            )}
            {(!statusUnavailable && (paid || (terminal && !partial))) && (
              <button
                type="button"
                className="button primary"
                disabled={!!busy}
                onClick={() => action("new-order")}
              >
                {busy === "new-order"
                  ? "Getting ready…"
                  : paid
                    ? "Start a new order"
                    : "Return to checkout"}
                <Icon name="arrow" />
              </button>
            )}
          </div>
          <p className="payment-help">
            Need help? Quote order <strong>{order.reference}</strong>
            {payment && (
              <>
                {" "}
                and Airbenda reference <strong>{payment.reference}</strong>
              </>
            )}{" "}
            when contacting the shop.
          </p>
        </section>
        <aside className="order-summary">
          <span className="eyebrow">YOUR LITTLE COLLECTION</span>
          <h2>{paid ? "Order confirmed" : "Order summary"}</h2>
          <div className="checkout-lines">
            {order.items.map((line) => (
              <div className="checkout-line" key={line.productId}>
                <Artwork
                  product={products.find(
                    (product) => product.id === line.productId,
                  )!}
                />
                <div>
                  <h3>{line.name}</h3>
                  <p>A4 print × {line.quantity}</p>
                </div>
                <strong>
                  {formatKobo(line.unitPriceKobo * line.quantity)}
                </strong>
              </div>
            ))}
          </div>
          <div className="summary-row">
            <span>Artworks</span>
            <span>{formatKobo(order.totalKobo - order.deliveryKobo)}</span>
          </div>
          <div className="summary-row">
            <span>Delivery</span>
            <span>
              {order.deliveryKobo ? formatKobo(order.deliveryKobo) : "Free"}
            </span>
          </div>
          <div className="summary-row">
            <strong>Order total</strong>
            <strong>{formatKobo(order.totalKobo)}</strong>
          </div>
          {payment && (
            <>
              <div className="summary-row">
                <span>Airtime conversion</span>
                <span>{formatKobo(payment.airtimeKobo - order.totalKobo)}</span>
              </div>
              <div className="summary-row">
                <span>Airbenda service charge</span>
                <span>{formatKobo(payment.serviceKobo)}</span>
              </div>
              {payment.suffixKobo > 0 && (
                <div className="summary-row">
                  <span>Network verification tag</span>
                  <span>{formatKobo(payment.suffixKobo)}</span>
                </div>
              )}
              <div className="summary-row total">
                <span>Total airtime</span>
                <strong>{formatKobo(payment.totalKobo)}</strong>
              </div>
              {payment.receivedKobo > 0 && (
                <>
                  <div className="summary-row">
                    <span>Airtime received</span>
                    <strong>{formatKobo(payment.receivedKobo)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Remaining</span>
                    <strong>{formatKobo(payment.remainingKobo)}</strong>
                  </div>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
