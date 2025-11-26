-- Change price column from real (float4) to bigint to avoid floating point precision issues
-- Prices should be stored in cents as integers (e.g., $10.00 = 1000)
alter table "public"."workspace_subscription_products"
  alter column "price" type bigint using (price::bigint);
