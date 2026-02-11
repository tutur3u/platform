-- RLS policies for time_tracking_requests table
-- Workflow: 
-- 1. Users create requests (INSERT) with PENDING status
-- 2. Users can update/delete their own PENDING requests
-- 3. Other workspace members (approvers) can approve/reject requests but cannot modify content
-- 4. All workspace members can read requests

-- Trigger function to enforce field immutability rules
create or replace function check_time_tracking_request_update()
returns trigger as $$
begin
    -- If user is NOT the owner (approver path)
    if NEW.user_id <> auth.uid() then
        -- Ensure content fields are not modified
        if NEW.title <> OLD.title 
            OR NEW.description IS DISTINCT FROM OLD.description
            OR NEW.start_time <> OLD.start_time
            OR NEW.end_time <> OLD.end_time
            OR NEW.task_id IS DISTINCT FROM OLD.task_id
            OR NEW.category_id IS DISTINCT FROM OLD.category_id
            OR NEW.images IS DISTINCT FROM OLD.images then
            raise exception 'Approvers cannot modify request content fields';
        end if;
        
        -- Ensure ownership/creation fields are not modified
        if NEW.user_id <> OLD.user_id 
            OR NEW.workspace_id <> OLD.workspace_id 
            OR NEW.created_at <> OLD.created_at then
            raise exception 'Cannot modify ownership or creation fields';
        end if;
        
        -- Validate approval/rejection data integrity
        if NEW.approval_status = 'APPROVED' then
            if NEW.approved_by <> auth.uid() OR NEW.approved_at IS NULL then
                raise exception 'Invalid approval data';
            end if;
            if NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL then
                raise exception 'Cannot have rejection data when approving';
            end if;
        elsif NEW.approval_status = 'REJECTED' then
            if NEW.rejected_by <> auth.uid() OR NEW.rejected_at IS NULL OR NEW.rejection_reason IS NULL then
                raise exception 'Invalid rejection data';
            end if;
            if NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL then
                raise exception 'Cannot have approval data when rejecting';
            end if;
        end if;
    end if;
    
    -- If user IS the owner, ensure they can't change approval status
    if NEW.user_id = auth.uid() then
        if NEW.approval_status <> OLD.approval_status then
            raise exception 'Request owner cannot change approval status';
        end if;
    end if;
    
    return NEW;
end;
$$ language plpgsql security invoker;

-- Attach trigger
drop trigger if exists enforce_time_tracking_request_update on time_tracking_requests;
create trigger enforce_time_tracking_request_update
    before update on time_tracking_requests
    for each row
    execute function check_time_tracking_request_update();

alter table time_tracking_requests enable row level security;


create policy "Enable read access for member of workspace" on "public"."time_tracking_requests" 
as permissive 
for select 
to authenticated 
using (
    is_org_member(auth.uid(), workspace_id)
);

create policy "Enable insert access for member of workspace" on "public"."time_tracking_requests"
as permissive
for insert
to authenticated
with check (
    -- In RLS policies, column names refer to the row being inserted
    is_org_member(auth.uid(), workspace_id)
    and approval_status = 'PENDING'
    and user_id = auth.uid()
);

create policy "User can update their own PENDING request" on "public"."time_tracking_requests" as permissive for update to authenticated 
using (
    -- Must be a member (checks OLD row)
    is_org_member(auth.uid(), workspace_id)
    -- Must be the owner (checks OLD row)
    AND auth.uid() = user_id
    -- Can only update if the request is still PENDING (checks OLD row)
    AND approval_status = 'PENDING'
)
with check (
    -- The with check clause validates the NEW row after update
    -- Prevent changing ownership: user_id must match the authenticated user
    user_id = auth.uid()
    -- Prevent changing workspace
    AND is_org_member(auth.uid(), workspace_id)
    -- Ensure status remains PENDING
    AND approval_status = 'PENDING'
);

create policy "Approver can update status fields only" on "public"."time_tracking_requests" as permissive for update to authenticated 
using (
    -- Must be a member and NOT the request submitter (to prevent self-approval)
    is_org_member(auth.uid(), workspace_id)
    AND auth.uid() <> user_id 
    -- Request must be PENDING to be approved/rejected
    AND approval_status = 'PENDING'
    -- TODO: Add proper role check when role system is implemented
    -- AND is_approver(auth.uid(), workspace_id)
)
with check (
    -- Basic validation in RLS: approver can change to APPROVED or REJECTED
    -- More complex validation (field immutability, correct status fields) is handled by trigger
    is_org_member(auth.uid(), workspace_id)
    AND (approval_status = 'APPROVED' OR approval_status = 'REJECTED')
);

create policy "Owner can delete PENDING request" on "public"."time_tracking_requests" as permissive for delete to authenticated using (
    -- Must be a member
    is_org_member(auth.uid(), workspace_id)
    -- Must be the owner
    AND auth.uid() = user_id
    -- Must be PENDING
    AND approval_status = 'PENDING'
);

-- Index to improve RLS policy performance
create index if not exists idx_time_tracking_requests_workspace_user 
on time_tracking_requests(workspace_id, user_id, approval_status);