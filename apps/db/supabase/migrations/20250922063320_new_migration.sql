create type "public"."promotion_type" as enum ('REGULAR', 'REFERRAL');

create table "public"."workspace_settings" (
    "ws_id" uuid not null,
    "referral_increment_percent" integer not null default 5,
    "referral_count_cap" integer not null default 3,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."workspace_promotions" add column "owner_id" uuid;

alter table "public"."workspace_promotions" add column "promo_type" promotion_type not null default 'REGULAR'::promotion_type;

alter table "public"."workspace_users" add column "referred_by" uuid;

CREATE UNIQUE INDEX one_referral_promo_per_user ON public.workspace_promotions USING btree (owner_id) WHERE (promo_type = 'REFERRAL'::promotion_type);

CREATE UNIQUE INDEX workspace_settings_pkey ON public.workspace_settings USING btree (ws_id);

alter table "public"."workspace_settings" add constraint "workspace_settings_pkey" PRIMARY KEY using index "workspace_settings_pkey";

alter table "public"."workspace_promotions" add constraint "chk_referral_promo_must_have_owner" CHECK (((promo_type <> 'REFERRAL'::promotion_type) OR (owner_id IS NOT NULL))) not valid;

alter table "public"."workspace_promotions" validate constraint "chk_referral_promo_must_have_owner";

alter table "public"."workspace_promotions" add constraint "chk_regular_promo_has_no_owner" CHECK (((promo_type <> 'REGULAR'::promotion_type) OR (owner_id IS NULL))) not valid;

alter table "public"."workspace_promotions" validate constraint "chk_regular_promo_has_no_owner";

alter table "public"."workspace_promotions" add constraint "fk_workspace_promotions_owner" FOREIGN KEY (owner_id) REFERENCES workspace_users(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_promotions" validate constraint "fk_workspace_promotions_owner";

alter table "public"."workspace_settings" add constraint "workspace_settings_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."workspace_settings" validate constraint "workspace_settings_ws_id_fkey";

alter table "public"."workspace_users" add constraint "fk_workspace_users_referred_by" FOREIGN KEY (referred_by) REFERENCES workspace_users(id) ON DELETE SET NULL not valid;

alter table "public"."workspace_users" validate constraint "fk_workspace_users_referred_by";

create or replace view "public"."v_user_referral_discounts" as  WITH referral_counts AS (
         SELECT workspace_users.referred_by AS user_id,
            count(*) AS active_referral_count
           FROM workspace_users
          WHERE ((workspace_users.referred_by IS NOT NULL) AND (workspace_users.archived = false))
          GROUP BY workspace_users.referred_by
        )
 SELECT p.id AS promo_id,
    p.owner_id AS user_id,
    p.code AS promo_code,
    (LEAST(COALESCE(rc.active_referral_count, (0)::bigint), (s.referral_count_cap)::bigint) * s.referral_increment_percent) AS calculated_discount_value,
    p.ws_id
   FROM ((workspace_promotions p
     LEFT JOIN referral_counts rc ON ((p.owner_id = rc.user_id)))
     JOIN workspace_settings s ON ((p.ws_id = s.ws_id)))
  WHERE (p.promo_type = 'REFERRAL'::promotion_type);


grant delete on table "public"."workspace_settings" to "anon";

grant insert on table "public"."workspace_settings" to "anon";

grant references on table "public"."workspace_settings" to "anon";

grant select on table "public"."workspace_settings" to "anon";

grant trigger on table "public"."workspace_settings" to "anon";

grant truncate on table "public"."workspace_settings" to "anon";

grant update on table "public"."workspace_settings" to "anon";

grant delete on table "public"."workspace_settings" to "authenticated";

grant insert on table "public"."workspace_settings" to "authenticated";

grant references on table "public"."workspace_settings" to "authenticated";

grant select on table "public"."workspace_settings" to "authenticated";

grant trigger on table "public"."workspace_settings" to "authenticated";

grant truncate on table "public"."workspace_settings" to "authenticated";

grant update on table "public"."workspace_settings" to "authenticated";

grant delete on table "public"."workspace_settings" to "service_role";

grant insert on table "public"."workspace_settings" to "service_role";

grant references on table "public"."workspace_settings" to "service_role";

grant select on table "public"."workspace_settings" to "service_role";

grant trigger on table "public"."workspace_settings" to "service_role";

grant truncate on table "public"."workspace_settings" to "service_role";

grant update on table "public"."workspace_settings" to "service_role";


ALTER TABLE public.workspace_promotions
ADD CONSTRAINT workspace_promotions_ws_id_id_key UNIQUE (ws_id, id);

ALTER TABLE public.workspace_settings
ADD COLUMN referral_promotion_id uuid NULL,
ADD CONSTRAINT workspace_settings_referral_promo_fkey
  FOREIGN KEY (ws_id, referral_promotion_id)
  REFERENCES public.workspace_promotions (ws_id, id)
  ON DELETE SET NULL;

ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow ALL operations for workspace members"
ON public.workspace_settings
FOR ALL
USING (
  is_org_member(auth.uid(), ws_id)
)
WITH CHECK (
  is_org_member(auth.uid(), ws_id)
);


ALTER TABLE public.workspace_promotions
ADD CONSTRAINT workspace_promotions_ws_id_id_key UNIQUE (ws_id, id);

ALTER TABLE public.workspace_settings
ADD COLUMN referral_promotion_id uuid NULL,
ADD CONSTRAINT workspace_settings_referral_promo_fkey
  FOREIGN KEY (ws_id, referral_promotion_id)
  REFERENCES public.workspace_promotions (ws_id, id)
  ON DELETE SET NULL;