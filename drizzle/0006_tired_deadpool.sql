CREATE TABLE "blobs" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"wrapped_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paypal_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"verified" boolean NOT NULL,
	"summary" text,
	"body" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "paypal_webhook_events_resource_idx" ON "paypal_webhook_events" USING btree ("resource_id");--> statement-breakpoint
-- Copy the renders already stored in render_media into blobs (render_media is kept, nothing is dropped).
INSERT INTO "blobs" ("key", "kind", "mime", "sha256", "bytes", "created_at") SELECT 'render:' || "render_id", 'render', "mime", "sha256", "bytes", "created_at" FROM "render_media" ON CONFLICT ("key") DO NOTHING;
