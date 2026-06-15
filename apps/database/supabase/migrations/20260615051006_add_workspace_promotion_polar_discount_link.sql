-- Link an inventory promotion to the Polar discount it mirrors, so the coupon
-- applies at Polar checkout. Additive + nullable: promotions without a Polar
-- integration simply leave this null.

alter table "private"."workspace_promotions"
  add column if not exists "polar_discount_id" text;
