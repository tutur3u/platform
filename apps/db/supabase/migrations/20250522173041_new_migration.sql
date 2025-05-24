drop view if exists "public"."meet_together_users";

drop view if exists "public"."workspace_members_and_invites";

alter table "public"."user_private_details" drop column "full_name";

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


create or replace view "public"."workspace_members_and_invites" as  SELECT wi.ws_id,
    u.id,
    u.handle,
    NULL::text AS email,
    u.display_name,
    u.avatar_url,
    COALESCE(wm.role, wi.role) AS role,
    COALESCE(wm.role_title, wi.role_title) AS role_title,
    COALESCE(wm.created_at, wi.created_at) AS created_at,
    (wm.user_id IS NULL) AS pending
   FROM ((workspace_invites wi
     LEFT JOIN workspace_members wm ON (((wi.user_id = wm.user_id) AND (wi.ws_id = wm.ws_id))))
     JOIN users u ON ((wi.user_id = u.id)))
UNION
 SELECT wm.ws_id,
    wm.user_id AS id,
    u.handle,
    upd.email,
    u.display_name,
    u.avatar_url,
    wm.role,
    wm.role_title,
    wm.created_at,
    false AS pending
   FROM ((workspace_members wm
     JOIN users u ON ((wm.user_id = u.id)))
     JOIN user_private_details upd ON ((upd.user_id = u.id)))
UNION
 SELECT wei.ws_id,
    NULL::uuid AS id,
    NULL::text AS handle,
    wei.email,
    NULL::text AS display_name,
    NULL::text AS avatar_url,
    wei.role,
    wei.role_title,
    wei.created_at,
    true AS pending
   FROM workspace_email_invites wei;



