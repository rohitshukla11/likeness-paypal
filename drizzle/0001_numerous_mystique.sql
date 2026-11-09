CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"pending_setup_token_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"photo_ref" text,
	"payout_paypal_email" text,
	"price_per_render_cents" integer DEFAULT 200 NOT NULL,
	"video_multiplier" integer DEFAULT 3 NOT NULL,
	"allowed_uses" text[] DEFAULT ARRAY['advertising','social']::text[] NOT NULL,
	"max_renders_per_licence" integer DEFAULT 10 NOT NULL,
	"max_days" integer DEFAULT 30 NOT NULL,
	"accepting_licences" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licences" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"price_per_render_cents" integer NOT NULL,
	"video_multiplier" integer DEFAULT 3 NOT NULL,
	"allowed_uses" text[] NOT NULL,
	"banned_uses" text[] DEFAULT ARRAY['political','adult','minors','impersonation','deception']::text[] NOT NULL,
	"render_cap" integer NOT NULL,
	"renders_used" integer DEFAULT 0 NOT NULL,
	"days" integer NOT NULL,
	"brief" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"terms_sha256" text,
	"approved_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"payment_token_id" text,
	"max_per_render_cents" integer NOT NULL,
	"daily_cap_cents" integer NOT NULL,
	"total_budget_cents" integer NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	"step_up_threshold_cents" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending_wallet' NOT NULL,
	"terms_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"render_id" text NOT NULL,
	"canonical_payload" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"signature" text NOT NULL,
	"alg" text DEFAULT 'Ed25519' NOT NULL,
	"key_id" text NOT NULL,
	"status" text NOT NULL,
	"output_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refusals" (
	"id" text PRIMARY KEY NOT NULL,
	"render_id" text,
	"licence_id" text,
	"mandate_id" text,
	"reason" text NOT NULL,
	"detail" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" text PRIMARY KEY NOT NULL,
	"licence_id" text NOT NULL,
	"mandate_id" text NOT NULL,
	"kind" text NOT NULL,
	"use" text NOT NULL,
	"prompt" text NOT NULL,
	"prompt_sha256" text NOT NULL,
	"output_ref" text,
	"output_sha256" text,
	"output_mime" text,
	"model" text,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"creator_payout_cents" integer DEFAULT 0 NOT NULL,
	"reserved" boolean DEFAULT false NOT NULL,
	"order_id" text,
	"authorization_id" text,
	"capture_id" text,
	"refund_id" text,
	"payout_batch_id" text,
	"payout_sender_batch_id" text,
	"review_deadline" timestamp with time zone,
	"decision" text,
	"decided_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paypal_vault_tokens" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licences" ADD CONSTRAINT "licences_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licences" ADD CONSTRAINT "licences_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_payment_token_id_paypal_vault_tokens_payment_token_id_fk" FOREIGN KEY ("payment_token_id") REFERENCES "public"."paypal_vault_tokens"("payment_token_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_render_id_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."renders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_render_id_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."renders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_licence_id_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "public"."licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_licence_id_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "public"."licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_order_id_paypal_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."paypal_orders"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_payout_sender_batch_id_paypal_payouts_sender_batch_id_fk" FOREIGN KEY ("payout_sender_batch_id") REFERENCES "public"."paypal_payouts"("sender_batch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brands_workspace_idx" ON "brands" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "creators_workspace_idx" ON "creators" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "licences_creator_idx" ON "licences" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "licences_brand_idx" ON "licences" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "mandates_brand_idx" ON "mandates" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_render_idx" ON "receipts" USING btree ("render_id");--> statement-breakpoint
CREATE INDEX "receipts_output_sha_idx" ON "receipts" USING btree ("output_sha256");--> statement-breakpoint
CREATE INDEX "refusals_render_idx" ON "refusals" USING btree ("render_id");--> statement-breakpoint
CREATE INDEX "renders_licence_idx" ON "renders" USING btree ("licence_id");--> statement-breakpoint
CREATE INDEX "renders_mandate_idx" ON "renders" USING btree ("mandate_id");--> statement-breakpoint
CREATE INDEX "renders_status_deadline_idx" ON "renders" USING btree ("status","review_deadline");--> statement-breakpoint
ALTER TABLE "paypal_vault_tokens" ADD CONSTRAINT "paypal_vault_tokens_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;