"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { products, formatPrice, cartTotal } from "@/lib/shop";
import { useShop, Quantity } from "./shop-provider";
import { PAYMENT_NETWORKS, type PublicOrder } from "@/lib/payments";
import { PaymentCheckout } from "./payment-checkout";
import { Artwork } from "./artwork";
import { Icon } from "./icons";

export function Checkout() {
  const { cart, ready, completeOrder } = useShop();
  const [delivery, setDelivery] = useState(0);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function loadCheckout(signal?: AbortSignal) {
    const response = await fetch("/api/checkout", {
      cache: "no-store",
      signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error || "We couldn’t load checkout. Please try again.",
      );
    setOrder(data.order);
    setConfigured(data.configured);
    setError(data.warning || "");
    setLoaded(true);
  }
  useEffect(() => {
    const controller = new AbortController();
    loadCheckout(controller.signal).catch((error) => {
      if (!controller.signal.aborted) {
        setError(error.message);
        setLoaded(true);
      }
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (order?.status === "paid") completeOrder(order);
  }, [order, completeOrder]);
  useEffect(() => {
    if (!order || !["creating", "pending"].includes(order.status)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await loadCheckout(controller.signal);
      } catch {
        if (!controller.signal.aborted)
          setError(
            "We couldn’t update payment status. Your order is saved; please check again.",
          );
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
      }
    }
    timer = setTimeout(poll, 5000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [order?.id, order?.status]);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    locked.current = true;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart,
          delivery: delivery === 10 ? "express" : "standard",
          network: data.get("network"),
          channel: data.get("channel"),
          customer: Object.fromEntries(
            ["name", "email", "phone", "address", "city", "state"].map(
              (key) => [key, data.get(key)],
            ),
          ),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            "We couldn’t start payment. Please check your saved order.",
        );
      setOrder(result.order);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      // The server may have saved an order even if the response was lost.
      await loadCheckout().catch(() => {});
      setError(
        error instanceof Error
          ? error.message
          : "We couldn’t start payment. Please check again before trying another payment.",
      );
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }
  if (!ready || !loaded)
    return (
      <main className="checkout-shell shell">
        <p role="status">Getting your checkout ready…</p>
      </main>
    );
  if (order)
    return (
      <PaymentCheckout
        order={order}
        error={error}
        onError={setError}
        onOrder={setOrder}
      />
    );
  if (cart.length === 0)
    return (
      <main className="checkout-shell shell">
        <div className="empty-state">
          <Icon name="bag" width="48" height="48" />
          <h1>Your bag is a blank canvas.</h1>
          <p>Add a little art to your bag before checking out.</p>
          <Link className="button primary" href="/#collection">
            Explore the collection <Icon name="arrow" />
          </Link>
        </div>
      </main>
    );
  return (
    <main className="checkout-shell shell">
      <Link href="/#collection" className="back-link">
        ← Back to the collection
      </Link>
      <span className="eyebrow">LET’S MAKE IT YOURS</span>
      <h1>The finishing touches.</h1>
      <p className="checkout-intro">
        A few details, and your little collection is complete.
      </p>
      {!configured && (
        <div className="demo-notice setup-notice" role="status">
          <Icon name="bag" />
          <p>
            <strong>Payments are temporarily unavailable</strong>The shop is
            setting up Airbenda. Your bag is saved; please check back shortly.
          </p>
        </div>
      )}
      <form
        className="checkout-grid"
        onSubmit={handleSubmit}
        onChange={(event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) target.setCustomValidity("");
        }}
      >
        <div className="checkout-form">
          <fieldset className="checkout-fields" disabled={submitting}>
            <section>
              <div className="form-heading">
                <span>01</span>
                <h2>Your details</h2>
              </div>
              <div className="form-fields">
                <label>
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    placeholder="e.g. Ada Okoro"
                  />
                </label>
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="field-wide">
                  Phone number
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    pattern="[+]?[0-9 ]{7,20}"
                    title="Enter a phone number with 7–20 digits or spaces, optionally starting with +."
                    placeholder="e.g. 0801 234 5678"
                  />
                </label>
              </div>
            </section>
            <section>
              <div className="form-heading">
                <span>02</span>
                <h2>A place for your art</h2>
              </div>
              <div className="form-fields">
                <label className="field-wide">
                  Street address
                  <input
                    name="address"
                    autoComplete="street-address"
                    required
                    maxLength={200}
                    placeholder="House number and street name"
                  />
                </label>
                <label>
                  City
                  <input
                    name="city"
                    autoComplete="address-level2"
                    required
                    maxLength={100}
                    placeholder="e.g. Lagos"
                  />
                </label>
                <label>
                  State / FCT
                  <input
                    name="state"
                    autoComplete="address-level1"
                    required
                    maxLength={100}
                    placeholder="e.g. Lagos"
                  />
                </label>
                <label className="field-wide">
                  Country
                  <input value="Nigeria" autoComplete="country-name" readOnly />
                </label>
              </div>
              <fieldset className="delivery-options">
                <legend>Delivery method</legend>
                <label
                  className={
                    delivery === 0
                      ? "delivery-option selected"
                      : "delivery-option"
                  }
                >
                  <input
                    type="radio"
                    name="delivery"
                    value="standard"
                    checked={delivery === 0}
                    onChange={() => setDelivery(0)}
                  />
                  <span>
                    <strong>Standard delivery</strong>
                    <small>Estimated 5–7 business days</small>
                  </span>
                  <strong>Free</strong>
                </label>
                <label
                  className={
                    delivery === 10
                      ? "delivery-option selected"
                      : "delivery-option"
                  }
                >
                  <input
                    type="radio"
                    name="delivery"
                    value="express"
                    checked={delivery === 10}
                    onChange={() => setDelivery(10)}
                  />
                  <span>
                    <strong>Express delivery</strong>
                    <small>Estimated 2–3 business days</small>
                  </span>
                  <strong>₦10</strong>
                </label>
              </fieldset>
            </section>
            <section>
              <div className="form-heading">
                <span>03</span>
                <h2>The final little step</h2>
              </div>
              <div className="form-fields">
                <label>
                  Mobile network
                  <select name="network" required defaultValue="">
                    <option value="" disabled>
                      Choose your network
                    </option>
                    {PAYMENT_NETWORKS.map((network) => (
                      <option key={network} value={network}>
                        {network}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pay with
                  <select name="channel" defaultValue="DIRECT_AIRTIME">
                    <option value="DIRECT_AIRTIME">
                      Direct airtime transfer
                    </option>
                    <option value="BANK_VTU">Bank app / VTU recharge</option>
                  </select>
                </label>
              </div>
              <div className="demo-notice payment-explainer">
                <Icon name="bag" />
                <p>
                  <strong>Pay with Airbenda</strong>You’ll receive the exact
                  airtime amount and transfer instructions next. Airtime
                  conversion, service, and matching charges are added to the
                  order total. For bank app / VTU, you buy airtime for the
                  receiving number; this is not a bank transfer.
                </p>
              </div>
              <label className="checkbox-label">
                <input type="checkbox" required name="payment-acknowledged" />I
                understand the final airtime amount will include Airbenda’s
                charges.
              </label>
            </section>
          </fieldset>
        </div>
        <aside className="order-summary">
          <span className="eyebrow">YOUR LITTLE COLLECTION</span>
          <h2>
            Order summary{" "}
            <span>({cart.reduce((sum, item) => sum + item.quantity, 0)})</span>
          </h2>
          <div className="checkout-lines">
            {cart.map((item) => {
              const product = products.find(
                (entry) => entry.id === item.productId,
              )!;
              return (
                <div className="checkout-line" key={product.id}>
                  <Artwork product={product} />
                  <div>
                    <h3>{product.name}</h3>
                    <p>A4 print · Unframed</p>
                    <Quantity
                      productId={product.id}
                      quantity={item.quantity}
                      disabled={submitting}
                    />
                  </div>
                  <strong>{formatPrice(product.price * item.quantity)}</strong>
                </div>
              );
            })}
          </div>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatPrice(cartTotal(cart))}</span>
          </div>
          <div className="summary-row">
            <span>Delivery</span>
            <span>{delivery === 0 ? "Free" : formatPrice(delivery)}</span>
          </div>
          <div className="summary-row total">
            <span>
              Total <small>NGN</small>
            </span>
            <strong>{formatPrice(cartTotal(cart) + delivery)}</strong>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="button primary full-width"
            disabled={submitting || !configured}
          >
            {submitting
              ? "Starting Airbenda…"
              : `Continue to payment · ${formatPrice(cartTotal(cart) + delivery)}`}
            <Icon name="arrow" />
          </button>
          <p className="summary-footnote">
            Your order is confirmed only after Airbenda verifies payment.
          </p>
        </aside>
      </form>
    </main>
  );
}
