import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  OrderInput,
  OrderStatus,
  Payment,
  PublicOrder,
} from "../payments.ts";

export type StoredOrder = PublicOrder &
  OrderInput & {
    sessionHash: string;
    sessionToken: string | null;
    updatedAt: string;
    archived: boolean;
  };
export class OrderStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, session_hash TEXT NOT NULL, gateway_id TEXT UNIQUE, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, document TEXT NOT NULL); CREATE INDEX IF NOT EXISTS orders_session ON orders(session_hash, archived, created_at);",
    );
    if (path !== ":memory:") chmodSync(path, 0o600);
  }
  private decode(row: unknown): StoredOrder | null {
    return row
      ? (JSON.parse((row as { document: string }).document) as StoredOrder)
      : null;
  }
  current(sessionHash: string) {
    return this.decode(
      this.db
        .prepare(
          "SELECT document FROM orders WHERE session_hash=? AND archived=0 ORDER BY created_at DESC LIMIT 1",
        )
        .get(sessionHash),
    );
  }
  byGateway(id: string) {
    return this.decode(
      this.db.prepare("SELECT document FROM orders WHERE gateway_id=?").get(id),
    );
  }
  get(id: string) {
    return this.decode(
      this.db.prepare("SELECT document FROM orders WHERE id=?").get(id),
    );
  }
  claim(
    sessionHash: string,
    input: OrderInput,
  ): { order: StoredOrder; created: boolean } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.current(sessionHash);
      if (previous) {
        this.db.exec("COMMIT");
        return { order: previous, created: false };
      }
      const dailyCount = this.db
        .prepare(
          "SELECT count(*) AS n FROM orders WHERE session_hash=? AND created_at>?",
        )
        .get(sessionHash, new Date(Date.now() - 86400000).toISOString()) as {
        n: number;
      };
      if (dailyCount.n >= 20)
        throw new Error("Please wait before starting another payment.");
      const now = new Date().toISOString();
      const order: StoredOrder = {
        ...input,
        id: randomUUID(),
        reference: `FM-${randomUUID().slice(0, 8).toUpperCase()}`,
        sessionHash,
        sessionToken: null,
        status: "creating",
        payment: null,
        createdAt: now,
        updatedAt: now,
        archived: false,
      };
      this.db
        .prepare(
          "INSERT INTO orders (id, session_hash, created_at, document) VALUES (?,?,?,?)",
        )
        .run(order.id, sessionHash, now, JSON.stringify(order));
      this.db.exec("COMMIT");
      return { order, created: true };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  update(
    id: string,
    change: Partial<
      Pick<StoredOrder, "status" | "payment" | "sessionToken" | "archived">
    >,
  ): StoredOrder {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(id);
      if (!current) throw new Error("Order not found.");
      if (
        current.status === "refunded" &&
        change.status &&
        change.status !== "refunded"
      ) {
        this.db.exec("COMMIT");
        return current;
      }
      if (
        change.payment &&
        current.payment &&
        change.payment.receivedKobo < current.payment.receivedKobo &&
        change.status !== "refunded"
      ) {
        this.db.exec("COMMIT");
        return current;
      }
      if (
        ["paid", "refunded"].includes(current.status) &&
        change.status &&
        [
          "pending",
          "creating",
          "uncertain",
          "expired",
          "failed",
          "cancelled",
        ].includes(change.status)
      ) {
        this.db.exec("COMMIT");
        return current;
      }
      const updated = {
        ...current,
        ...change,
        updatedAt: new Date().toISOString(),
      };
      this.db
        .prepare(
          "UPDATE orders SET document=?, gateway_id=?, archived=? WHERE id=?",
        )
        .run(
          JSON.stringify(updated),
          updated.payment?.id ?? null,
          updated.archived ? 1 : 0,
          id,
        );
      this.db.exec("COMMIT");
      return updated;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  savePayment(
    id: string,
    payment: Payment,
    status: OrderStatus,
    sessionToken?: string,
  ) {
    return this.update(id, {
      payment,
      status,
      ...(sessionToken ? { sessionToken } : {}),
    });
  }
  close() {
    this.db.close();
  }
}
let store: OrderStore | undefined;
export function getOrderStore() {
  return (store ??= new OrderStore(
    process.env.SHOP_DATABASE_PATH ||
      resolve(process.cwd(), ".data", "orders.sqlite"),
  ));
}
export function publicOrder(order: StoredOrder): PublicOrder {
  const {
    id,
    reference,
    status,
    items,
    deliveryKobo,
    totalKobo,
    createdAt,
    payment,
  } = order;
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
