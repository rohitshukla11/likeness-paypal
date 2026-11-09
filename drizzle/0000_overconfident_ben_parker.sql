CREATE TABLE "paypal_orders" (
	"order_id" text PRIMARY KEY NOT NULL,
	"payment_token_id" text,
	"status" text NOT NULL,
	"authorization_id" text,
	"authorization_status" text,
	"capture_id" text,
	"refund_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"custom_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paypal_payouts" (
	"sender_batch_id" text PRIMARY KEY NOT NULL,
	"payout_batch_id" text,
	"receiver_email" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paypal_vault_tokens" (
	"payment_token_id" text PRIMARY KEY NOT NULL,
	"setup_token_id" text NOT NULL,
	"customer_id" text,
	"payer_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paypal_orders" ADD CONSTRAINT "paypal_orders_payment_token_id_paypal_vault_tokens_payment_token_id_fk" FOREIGN KEY ("payment_token_id") REFERENCES "public"."paypal_vault_tokens"("payment_token_id") ON DELETE no action ON UPDATE no action;