drop view if exists "public"."meet_together_users";

alter table "public"."meet_together_plans" add column "allow_anonymous_edit" boolean not null default true;

create or replace view "public"."meet_together_users" as  SELECT DISTINCT ON (all_users.id, COALESCE(gtbs.plan_id, utbs.plan_id)) all_users.id AS user_id,
    COALESCE(NULLIF(all_users.name, ''::text), upd.email) AS display_name,
    COALESCE(gtbs.plan_id, utbs.plan_id) AS plan_id,
        CASE
            WHEN all_users.is_guest THEN true
            ELSE false
        END AS is_guest,
    count(COALESCE(gtbs.id, utbs.id)) AS timeblock_count
   FROM ((((( SELECT meet_together_guests.id,
            meet_together_guests.name,
            true AS is_guest
           FROM meet_together_guests
        UNION ALL
         SELECT u.id,
            u.display_name AS name,
            false AS is_guest
           FROM users u) all_users
     LEFT JOIN user_private_details upd ON ((all_users.id = upd.user_id)))
     LEFT JOIN meet_together_guest_timeblocks gtbs ON (((all_users.id = gtbs.user_id) AND all_users.is_guest)))
     LEFT JOIN meet_together_user_timeblocks utbs ON (((all_users.id = utbs.user_id) AND (NOT all_users.is_guest))))
     LEFT JOIN meet_together_plans plans ON ((plans.id = COALESCE(gtbs.plan_id, utbs.plan_id))))
  WHERE (COALESCE(gtbs.plan_id, utbs.plan_id) IS NOT NULL)
  GROUP BY all_users.id, all_users.name, upd.email, all_users.is_guest, gtbs.plan_id, utbs.plan_id;



