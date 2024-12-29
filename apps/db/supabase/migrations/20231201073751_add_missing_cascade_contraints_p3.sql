alter table "public"."transaction_categories" drop constraint "transaction_categories_ws_id_fkey";

alter table "public"."wallet_transactions" drop constraint "wallet_transactions_category_id_fkey";

alter table "public"."wallet_transactions" drop constraint "wallet_transactions_wallet_id_fkey";

alter table "public"."transaction_categories" add constraint "transaction_categories_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."transaction_categories" validate constraint "transaction_categories_ws_id_fkey";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_category_id_fkey" FOREIGN KEY (category_id) REFERENCES transaction_categories(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_transactions_category_id_fkey";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES workspace_wallets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_transactions_wallet_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_invite_when_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin -- Delete the invite
delete FROM public.workspace_invites i
WHERE i.ws_id = new.ws_id
  AND i.user_id = new.user_id;
return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_member_roles_from_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin -- Copy role and role_title from invite to new member
  new.role := coalesce(
    (
      SELECT i.role
      FROM public.workspace_invites i
      WHERE i.ws_id = new.ws_id
        AND i.user_id = new.user_id
    ),
    new.role,
    'MEMBER'::text
  );
new.role_title := coalesce(
  (
    SELECT i.role_title
    FROM public.workspace_invites i
    WHERE i.ws_id = new.ws_id
      AND i.user_id = new.user_id
  ),
  new.role_title,
  ''::text
);
return new;
end;
$function$
;


