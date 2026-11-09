/** Database schema (Drizzle, Postgres on Neon). Money is stored in integer cents with a currency code. */
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** A brand's saved PayPal wallet: the approved setup token and the payment token (vault_id) made from it. */
export const paypalVaultTokens = pgTable("paypal_vault_tokens", {
  paymentTokenId: text("payment_token_id").primaryKey(),
  setupTokenId: text("setup_token_id").notNull(),
  customerId: text("customer_id"),
  payerEmail: text("payer_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** An order charged to a saved wallet: its authorization, and then a capture (and refund) or a void. */
export const paypalOrders = pgTable("paypal_orders", {
  orderId: text("order_id").primaryKey(),
  paymentTokenId: text("payment_token_id").references(() => paypalVaultTokens.paymentTokenId),
  status: text("status").notNull(),
  authorizationId: text("authorization_id"),
  authorizationStatus: text("authorization_status"),
  captureId: text("capture_id"),
  refundId: text("refund_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  customId: text("custom_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A payout to a creator. sender_batch_id is the idempotency key. */
export const paypalPayouts = pgTable("paypal_payouts", {
  senderBatchId: text("sender_batch_id").primaryKey(),
  payoutBatchId: text("payout_batch_id"),
  receiverEmail: text("receiver_email").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
