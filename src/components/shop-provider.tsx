"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  completePaidCart,
  type PaidCart,
  type PublicOrder,
} from "@/lib/payments";
import {
  cartTotal,
  formatPrice,
  MAX_QUANTITY,
  normalizeCart,
  products,
  type CartItem,
} from "@/lib/shop";
import { Artwork } from "./artwork";
import { Dialog } from "./dialog";
import { Icon } from "./icons";

type ShopContextValue = {
  cart: CartItem[];
  ready: boolean;
  addItem: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  openCart: () => void;
  completeOrder: (order: PublicOrder) => void;
};
const ShopContext = createContext<ShopContextValue | null>(null);
export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("ShopProvider is missing");
  return value;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [cartState, setCartState] = useState<PaidCart>({
    items: [],
    paidOrders: [],
  });
  const cart = cartState.items;
  function setCart(update: (items: CartItem[]) => CartItem[]) {
    setCartState((current) => ({ ...current, items: update(current.items) }));
  }
  const [ready, setReady] = useState(false);
  const [isCartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const pathname = usePathname();
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("forma-cart-v2") || "null");
      setCartState({
        items: normalizeCart(
          saved?.items ??
            JSON.parse(localStorage.getItem("forma-cart-v1") || "[]"),
        ),
        paidOrders: Array.isArray(saved?.paidOrders)
          ? saved.paidOrders
              .filter((id: unknown) => typeof id === "string")
              .slice(-100)
          : [],
      });
    } catch {
      /* A fresh cart is safe when storage is unavailable. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("forma-cart-v2", JSON.stringify(cartState));
      } catch {
        /* Shopping remains available without persistence. */
      }
    }
  }, [cartState, ready]);
  useEffect(() => {
    if (notice) {
      const timeout = window.setTimeout(() => setNotice(""), 3000);
      return () => clearTimeout(timeout);
    }
  }, [notice]);
  const closeCart = useCallback(() => setCartOpen(false), []);
  function addItem(id: string) {
    if (!ready || !products.some((product) => product.id === id)) return;
    setCart((current) => {
      const existing = current.find((item) => item.productId === id);
      return existing
        ? current.map((item) =>
            item.productId === id
              ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + 1) }
              : item,
          )
        : [...current, { productId: id, quantity: 1 }];
    });
    setNotice(
      `${products.find((product) => product.id === id)!.name} added to your bag`,
    );
  }
  function setQuantity(id: string, quantity: number) {
    if (!Number.isInteger(quantity)) return;
    setCart((current) =>
      current.flatMap((item) =>
        item.productId !== id
          ? [item]
          : quantity <= 0
            ? []
            : [{ ...item, quantity: Math.min(MAX_QUANTITY, quantity) }],
      ),
    );
  }
  const completeOrder = useCallback((order: PublicOrder) => {
    setCartState((current) => completePaidCart(current, order));
  }, []);
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  return (
    <ShopContext.Provider
      value={{
        cart,
        ready,
        addItem,
        setQuantity,
        openCart: () => setCartOpen(true),
        completeOrder,
      }}
    >
      <div className="announcement">
        Small prices. Big personality. <span>Art prints from ₦30 — ₦50.</span>
      </div>
      <header className="site-header shell">
        <Link href="/" className="wordmark" aria-label="Forma home">
          <span className="brand-mark">✳</span> forma
          <span className="wordmark-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link
            href="/#collection"
            aria-current={pathname === "/" ? "page" : undefined}
          >
            The collection
          </Link>
          <Link href="/#our-story">
            Our little story <span>↗</span>
          </Link>
        </nav>
        <button
          type="button"
          className="bag-button"
          onClick={() => setCartOpen(true)}
          aria-label={`Open shopping bag, ${count} items`}
        >
          <Icon name="bag" />
          <span>Bag</span>
          <span className="bag-count">{count}</span>
        </button>
      </header>
      {children}
      <footer className="site-footer shell">
        <Link href="/" className="wordmark">
          forma.
        </Link>
        <p>A little art. A lot of feeling.</p>
        <span>© {new Date().getFullYear()} Forma Studio</span>
      </footer>
      <div
        className={`toast ${notice ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice && (
          <>
            <Icon name="check" />
            {notice}
            <button
              type="button"
              onClick={() => {
                setNotice("");
                setCartOpen(true);
              }}
            >
              View bag <span>↗</span>
            </button>
          </>
        )}
      </div>
      {isCartOpen && (
        <Dialog title="Shopping bag" drawer onClose={closeCart}>
          <div className="cart-heading">
            <span className="eyebrow">GOOD THINGS IN HERE</span>
            <h2>
              Your bag <span>({count})</span>
            </h2>
          </div>
          {cart.length === 0 ? (
            <div className="empty-state">
              <Icon name="bag" width="44" height="44" />
              <h3>A little room for art.</h3>
              <p>Your bag is empty. Find something that feels like you.</p>
              <button
                type="button"
                className="button primary"
                onClick={closeCart}
              >
                Explore the collection <Icon name="arrow" />
              </button>
            </div>
          ) : (
            <>
              <div className="cart-lines">
                {cart.map((item) => {
                  const product = products.find(
                    (entry) => entry.id === item.productId,
                  )!;
                  return (
                    <div className="cart-line" key={item.productId}>
                      <Artwork product={product} />
                      <div className="cart-line-info">
                        <h3>{product.name}</h3>
                        <p>A4 art print · Unframed</p>
                        <Quantity
                          productId={product.id}
                          quantity={item.quantity}
                        />
                        <button
                          type="button"
                          className="text-button remove-button"
                          onClick={() => setQuantity(product.id, 0)}
                        >
                          Remove
                        </button>
                      </div>
                      <strong>
                        {formatPrice(product.price * item.quantity)}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <div className="cart-bottom">
                <div className="summary-row">
                  <span>Subtotal</span>
                  <strong>{formatPrice(cartTotal(cart))}</strong>
                </div>
                <p>
                  Standard delivery is on us. Express available at checkout.
                </p>
                <Link
                  className="button primary full-width"
                  href="/checkout"
                  onClick={closeCart}
                >
                  Go to checkout <Icon name="arrow" />
                </Link>
                <button
                  type="button"
                  className="text-button continue-button"
                  onClick={closeCart}
                >
                  Keep exploring
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </ShopContext.Provider>
  );
}

export function Quantity({
  productId,
  quantity,
  disabled = false,
}: {
  productId: string;
  quantity: number;
  disabled?: boolean;
}) {
  const { setQuantity } = useShop();
  const name = products.find((product) => product.id === productId)?.name;
  return (
    <div className="quantity">
      <button
        type="button"
        disabled={disabled}
        aria-label={`Decrease ${name} quantity`}
        onClick={() => setQuantity(productId, quantity - 1)}
      >
        <Icon name="minus" width="14" height="14" />
      </button>
      <span aria-label={`${name} quantity`}>{quantity}</span>
      <button
        type="button"
        aria-label={`Increase ${name} quantity`}
        disabled={disabled || quantity >= MAX_QUANTITY}
        onClick={() => setQuantity(productId, quantity + 1)}
      >
        <Icon name="plus" width="14" height="14" />
      </button>
    </div>
  );
}
