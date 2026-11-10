ALTER TABLE "brands" ADD COLUMN "payment_token_id" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "wallet_kind" text;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_payment_token_id_paypal_vault_tokens_payment_token_id_fk" FOREIGN KEY ("payment_token_id") REFERENCES "public"."paypal_vault_tokens"("payment_token_id") ON DELETE no action ON UPDATE no action;