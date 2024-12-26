-- Rename public.projects to public.workspace_teams
ALTER TABLE public.projects
    RENAME TO workspace_teams;
-- Rename public.project_members to public.team_members
ALTER TABLE public.project_members
    RENAME TO team_members;
-- Rename public.team_members (project_id) to (team_id)
ALTER TABLE public.team_members
    RENAME COLUMN project_id TO team_id;
-- Rename public.project_wallets to public.workspace_wallets
ALTER TABLE public.project_wallets
    RENAME TO workspace_wallets;
-- Add ws_id to public.workspace_wallets
ALTER TABLE public.workspace_wallets
ADD COLUMN ws_id uuid;
-- Link public.workspace_wallets to public.workspaces
ALTER TABLE public.workspace_wallets
ADD CONSTRAINT workspace_wallets_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id);
-- Populate public.workspace_wallets with correct ws_id (via project_id)
UPDATE public.workspace_wallets
SET ws_id = public.workspace_teams.ws_id
FROM public.workspace_teams
WHERE public.workspace_wallets.project_id = public.workspace_teams.id;
-- Make ws_id NOT NULL
ALTER TABLE public.workspace_wallets
ALTER COLUMN ws_id
SET NOT NULL;
-- Drop policy "Enable all access for project members" from public.workspace_wallets
DROP POLICY "Enable all access for project members" ON public.workspace_wallets;
-- Remove project_id from public.workspace_wallets
ALTER TABLE public.workspace_wallets DROP COLUMN project_id;
-- Rename public.project_documents to public.workspace_documents
ALTER TABLE public.project_documents
    RENAME TO workspace_documents;
-- Rename public.workspace_documents (project_id) to (team_id)
ALTER TABLE public.workspace_documents
    RENAME COLUMN project_id TO team_id;
-- Add ws_id to public.workspace_documents
ALTER TABLE public.workspace_documents
ADD COLUMN ws_id uuid;
-- Link public.workspace_documents to public.workspaces
ALTER TABLE public.workspace_documents
ADD CONSTRAINT workspace_documents_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id);
-- Populate public.workspace_documents with correct ws_id (via team_id)
UPDATE public.workspace_documents
SET ws_id = public.workspace_teams.ws_id
FROM public.workspace_teams
WHERE public.workspace_documents.team_id = public.workspace_teams.id;
-- Make ws_id NOT NULL
ALTER TABLE public.workspace_documents
ALTER COLUMN ws_id
SET NOT NULL;
-- Drop policy "Enable all access for project members" from public.workspace_documents
DROP POLICY "Enable all access for project members" ON public.workspace_documents;
-- Drop team_id from public.workspace_documents
ALTER TABLE public.workspace_documents DROP COLUMN team_id;
-- Rename public.project_boards to public.workspace_boards
ALTER TABLE public.project_boards
    RENAME TO workspace_boards;
-- Rename public.workspace_boards (project_id) to (team_id)
ALTER TABLE public.workspace_boards
    RENAME COLUMN project_id TO team_id;
-- Add ws_id to public.workspace_boards
ALTER TABLE public.workspace_boards
ADD COLUMN ws_id uuid;
-- Link public.workspace_boards to public.workspaces
ALTER TABLE public.workspace_boards
ADD CONSTRAINT workspace_boards_ws_id_fkey FOREIGN KEY (ws_id) REFERENCES public.workspaces(id);
-- Populate public.workspace_boards with correct ws_id (via team_id)
UPDATE public.workspace_boards
SET ws_id = public.workspace_teams.ws_id
FROM public.workspace_teams
WHERE public.workspace_boards.team_id = public.workspace_teams.id;
-- Make ws_id NOT NULL
ALTER TABLE public.workspace_boards
ALTER COLUMN ws_id
SET NOT NULL;
-- Drop policy "Enable all access for project members" from public.workspace_boards
DROP POLICY "Enable all access for project members" ON public.workspace_boards;
-- Drop team_id from public.workspace_boards
ALTER TABLE public.workspace_boards DROP COLUMN team_id;
-- Drop old constraints on public.wallet_transactions, then add new ones
ALTER TABLE public.wallet_transactions DROP CONSTRAINT wallet_transactions_wallet_id_fkey;
ALTER TABLE public.wallet_transactions
ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.workspace_wallets(id);
-- Drop update_wallet_balance_tr trigger
DROP TRIGGER update_wallet_balance_tr ON public.wallet_transactions;
-- Create new update_wallet_balance_tr trigger
CREATE OR REPLACE FUNCTION public.update_wallet_balance() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF TG_OP = 'INSERT' THEN
UPDATE workspace_wallets
SET balance = balance + NEW.amount
WHERE id = NEW.wallet_id;
ELSIF TG_OP = 'UPDATE' THEN
UPDATE workspace_wallets
SET balance = balance - OLD.amount + NEW.amount
WHERE id = OLD.wallet_id;
ELSIF TG_OP = 'DELETE' THEN
UPDATE workspace_wallets
SET balance = balance - OLD.amount
WHERE id = OLD.wallet_id;
END IF;
RETURN NULL;
END;
$function$;
CREATE TRIGGER update_wallet_balance_tr
AFTER
INSERT
    OR DELETE
    OR
UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION update_wallet_balance();
create policy "Enable all access for workspace members" on "public"."workspace_wallets" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
alter table "public"."wallet_transactions" enable row level security;
create policy "Enable all access for organization members" on "public"."wallet_transactions" as permissive for all to authenticated using (
    (
        EXISTS (
            SELECT 1
            FROM workspace_wallets w
            WHERE (w.id = wallet_transactions.wallet_id)
        )
    )
) with check (
    (
        EXISTS (
            SELECT 1
            FROM workspace_wallets w
            WHERE (w.id = wallet_transactions.wallet_id)
        )
    )
);
create policy "Enable all access for organization members" on "public"."workspace_boards" as permissive for all to public using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
create policy "Enable all access for organization members" on "public"."workspace_documents" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));