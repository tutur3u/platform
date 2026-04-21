-- Invite links: store member type (MEMBER vs GUEST) for join-via-link flow

ALTER TABLE public.workspace_invite_links
ADD COLUMN type public.workspace_member_type NOT NULL DEFAULT 'MEMBER';
