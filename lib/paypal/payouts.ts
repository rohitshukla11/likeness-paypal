/**
 * Payouts v1: one payment to one recipient by email. sender_batch_id is the idempotency key: PayPal refuses a
 * second batch with the same id (and PayPal-Request-Id is set from it too).
 * https://developer.paypal.com/docs/api/payments.payouts-batch/v1/
 */
import { paypalRequest, type RequestOptions } from "./http";

export interface PayoutBatch {
  batch_header: {
    payout_batch_id: string;
    batch_status: string; // PENDING, PROCESSING, SUCCESS, DENIED, CANCELED
    sender_batch_header?: { sender_batch_id?: string };
  };
  items?: { payout_item_id: string; transaction_status?: string; transaction_id?: string; errors?: { name?: string; message?: string } }[];
}

export interface PayoutInput {
  /** Unique per payout (e.g. `payout-<licence id>`): retrying with the same id never pays twice. */
  senderBatchId: string;
  receiverEmail: string;
  amount: number | string;
  currency?: string;
  note?: string;
  senderItemId?: string;
  emailSubject?: string;
}

/** POST /v1/payments/payouts with a single EMAIL item. */
export function createPayout(input: PayoutInput, opts?: RequestOptions) {
  const value = typeof input.amount === "number" ? input.amount.toFixed(2) : input.amount;
  return paypalRequest<PayoutBatch>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        recipient_type: "EMAIL",
        email_subject: input.emailSubject ?? "You've been paid for a licensed ad",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value, currency: input.currency ?? "USD" },
          receiver: input.receiverEmail,
          note: input.note ?? "Licence payment",
          sender_item_id: input.senderItemId ?? input.senderBatchId,
        },
      ],
    },
    { requestId: input.senderBatchId, ...opts, representation: false },
  );
}

/** GET /v1/payments/payouts/{payout_batch_id}: the batch and its items' statuses. */
export function getPayout(payoutBatchId: string, opts?: RequestOptions) {
  return paypalRequest<PayoutBatch>("GET", `/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`, undefined, { ...opts, representation: false });
}
