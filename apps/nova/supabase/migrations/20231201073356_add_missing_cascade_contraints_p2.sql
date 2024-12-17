alter table "public"."finance_invoices" drop constraint "healthcare_prescriptions_patient_id_fkey";

alter table "public"."finance_invoices" drop constraint "healthcare_prescriptions_ws_id_fkey";

alter table "public"."finance_invoices" drop constraint "finance_invoices_creator_id_fkey";

alter table "public"."finance_invoices" drop constraint "finance_invoices_transaction_id_fkey";

alter table "public"."finance_invoices" add constraint "finance_invoices_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."finance_invoices" validate constraint "finance_invoices_customer_id_fkey";

alter table "public"."finance_invoices" add constraint "finance_invoices_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."finance_invoices" validate constraint "finance_invoices_ws_id_fkey";

alter table "public"."finance_invoices" add constraint "finance_invoices_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."finance_invoices" validate constraint "finance_invoices_creator_id_fkey";

alter table "public"."finance_invoices" add constraint "finance_invoices_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES wallet_transactions(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."finance_invoices" validate constraint "finance_invoices_transaction_id_fkey";

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


