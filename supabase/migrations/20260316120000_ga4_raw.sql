-- ga4_raw: detailed GA4 rows (edge function supabase/functions/ga4-sync writes here).
-- Not included in earlier remote_schema pulls; keeps repo aligned with production.
-- CREATE TABLE IF NOT EXISTS: skips if you already created the table in Dashboard.

CREATE TABLE IF NOT EXISTS "public"."ga4_raw" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "customer_id" text NOT NULL,
  "agency_id" uuid,
  "report_date" date NOT NULL,
  "page_location" text,
  "page_path" text,
  "page_title" text,
  "channel_group" text,
  "source" text,
  "medium" text,
  "source_medium" text,
  "campaign_name" text,
  "device_category" text,
  "country" text,
  "region" text,
  "city" text,
  "page_views" bigint DEFAULT 0,
  "total_users" bigint DEFAULT 0,
  "new_users" bigint DEFAULT 0,
  "sessions" bigint DEFAULT 0,
  "page_type" text,
  "synced_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ga4_raw_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."ga4_raw" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_ga4_raw_cust" ON "public"."ga4_raw" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_ga4_raw_date" ON "public"."ga4_raw" USING btree ("report_date");
CREATE INDEX IF NOT EXISTS "idx_ga4_raw_cust_date" ON "public"."ga4_raw" USING btree ("customer_id", "report_date");

DROP POLICY IF EXISTS "ga4_raw_access" ON "public"."ga4_raw";

CREATE POLICY "ga4_raw_access"
  ON "public"."ga4_raw"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (public.can_access_customer(customer_id));

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ga4_raw" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ga4_raw" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ga4_raw" TO "service_role";
