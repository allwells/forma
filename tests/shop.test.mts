import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cartTotal,
  normalizeCart,
  products,
  MAX_QUANTITY,
} from "../src/lib/shop.ts";

test("catalogue contains ten unique artworks priced between 30 and 50 naira", () => {
  assert.equal(products.length, 10);
  assert.equal(new Set(products.map((product) => product.id)).size, 10);
  assert.ok(
    products.every(
      (product) =>
        Number.isInteger(product.price) &&
        product.price >= 30 &&
        product.price <= 50,
    ),
  );
});

test("cart restoration rejects malformed quantities and unknown products", () => {
  assert.deepEqual(normalizeCart(null), []);
  assert.deepEqual(
    normalizeCart([
      null,
      { productId: "missing", quantity: 1 },
      { productId: "sunroom", quantity: "2" },
      { productId: "sunroom", quantity: 1.5 },
      { productId: "sunroom", quantity: -2 },
      { productId: "sunroom", quantity: 0 },
      { productId: "sunroom", quantity: 2 },
    ]),
    [{ productId: "sunroom", quantity: 2 }],
  );
});

test("restoration merges duplicate lines and caps quantities", () => {
  assert.deepEqual(
    normalizeCart([
      { productId: "sunroom", quantity: 6 },
      { productId: "sunroom", quantity: 8 },
      { productId: "wild-stems", quantity: 99 },
    ]),
    [
      { productId: "sunroom", quantity: MAX_QUANTITY },
      { productId: "wild-stems", quantity: MAX_QUANTITY },
    ],
  );
});

test("totals use trusted catalogue prices and handle multiple quantities", () => {
  assert.equal(cartTotal([]), 0);
  assert.equal(
    cartTotal([
      { productId: "sunroom", quantity: 2 },
      { productId: "wild-stems", quantity: 3 },
    ]),
    180,
  );
  assert.equal(cartTotal([{ productId: "unknown", quantity: 2 }]), 0);
});
