CREATE TABLE "creator_frames" (
	"creator_id" text NOT NULL,
	"idx" integer NOT NULL,
	"box" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_frames_creator_id_idx_pk" PRIMARY KEY("creator_id","idx")
);
--> statement-breakpoint
CREATE TABLE "frame_decryptions" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"render_id" text,
	"licence_id" text,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "status" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "channel" jsonb;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "verification" jsonb;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "wrapped_key" text;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "frames_sha256" text[];--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "public_photo" "bytea";--> statement-breakpoint
ALTER TABLE "creator_frames" ADD CONSTRAINT "creator_frames_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frame_decryptions" ADD CONSTRAINT "frame_decryptions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creators_google_sub_idx" ON "creators" USING btree ("google_sub");