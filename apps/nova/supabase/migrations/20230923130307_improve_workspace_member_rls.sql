drop policy "Enable read access for currently signed user" on "public"."user_private_details";
drop policy "Enable delete for organization members" on "public"."workspace_members";
create policy "Enable read access for current user and workspace users" on "public"."user_private_details" as permissive for
select to authenticated using (
    (
      (user_id = auth.uid())
      OR (
        EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE (wm.user_id = user_private_details.user_id)
        )
      )
    )
  );
create policy "Enable delete for organization members" on "public"."workspace_members" as permissive for delete to authenticated using (
  (
    (
      is_org_member(auth.uid(), ws_id)
      AND (
        (auth.uid() = user_id)
        OR (
          (get_user_role(auth.uid(), ws_id) = 'ADMIN'::text)
          AND (role <> 'OWNER'::text)
        )
        OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)
      )
    )
    OR has_other_owner(ws_id, user_id)
  )
);
DROP VIEW IF EXISTS public.workspace_members_and_invites;
CREATE VIEW public.workspace_members_and_invites AS
SELECT wi.ws_id,
  u.id,
  u.handle,
  NULL as email,
  u.display_name,
  u.avatar_url,
  COALESCE(wm.role, wi.role) AS role,
  COALESCE(wm.role_title, wi.role_title) AS role_title,
  COALESCE(wm.created_at, wi.created_at) AS created_at,
  (wm.user_id IS NULL) AS pending
FROM workspace_invites wi
  LEFT JOIN workspace_members wm ON wi.user_id = wm.user_id
  AND wi.ws_id = wm.ws_id
  JOIN users u ON wi.user_id = u.id
UNION
SELECT wm.ws_id,
  wm.user_id,
  u.handle,
  upd.email,
  u.display_name,
  u.avatar_url,
  wm.role,
  wm.role_title,
  wm.created_at,
  FALSE AS pending
FROM workspace_members wm
  JOIN users u ON wm.user_id = u.id
  JOIN user_private_details upd ON upd.user_id = u.id;
alter table "public"."users"
add constraint "users_handle_fkey" FOREIGN KEY (handle) REFERENCES handles(value) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."users" validate constraint "users_handle_fkey";
CREATE OR REPLACE FUNCTION public.sync_user_private_details() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$BEGIN IF (TG_OP = 'INSERT') THEN
INSERT INTO public.user_private_details (user_id, email, new_email)
VALUES (NEW.id, NEW.email, NEW.email_change);
ELSIF (
  NEW.email <> OLD.email
  OR NEW.email_change <> OLD.email_change
) THEN
UPDATE public.user_private_details
SET email = NEW.email,
  new_email = NEW.email_change
WHERE user_id = NEW.id;
END IF;
RETURN NEW;
END;
$function$;