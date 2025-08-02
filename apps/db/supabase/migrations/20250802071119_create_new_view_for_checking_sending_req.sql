create or replace view "public"."group_user_with_attendance" as  SELECT gu.group_id,
    wu.id AS user_id,
    wu.full_name,
    upc.post_id,
    upc.is_completed,
    gwa.attendance_count
   FROM (((workspace_user_groups_users gu
     JOIN workspace_users wu ON ((gu.user_id = wu.id)))
     LEFT JOIN user_group_post_checks upc ON ((wu.id = upc.user_id)))
     LEFT JOIN group_with_attendance gwa ON (((gu.group_id = gwa.group_id) AND (gu.user_id = gwa.user_id))));


create or replace view "public"."group_users_with_post_checks" as  SELECT gwa.group_id,
    gwa.ws_id,
    gwa.user_id,
    gwa.full_name,
    gwa.email,
    gwa.gender,
    gwa.phone,
    gwa.attendance_count,
    ugpc.post_id,
    ugpc.is_completed
   FROM (group_with_attendance gwa
     LEFT JOIN user_group_post_checks ugpc ON ((ugpc.user_id = gwa.user_id)));



