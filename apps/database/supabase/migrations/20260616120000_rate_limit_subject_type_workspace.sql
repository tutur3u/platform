-- Rate Limits Admin Center — step 1 of 2: add the 'workspace' subject type.
--
-- This MUST be a standalone migration: Postgres forbids using a newly added
-- enum value in the same transaction that adds it, and the follow-up migration
-- (rate_limit_admin_center) references 'workspace' in function bodies and
-- queries. Supabase applies each migration file in its own transaction, so the
-- value is committed before the next file runs.
--
-- Enum values cannot be removed, so this addition is intentionally irreversible.

ALTER TYPE public.abuse_reputation_subject_type ADD VALUE IF NOT EXISTS 'workspace';
