-- 1. Create the ENUM type first
CREATE TYPE public.blacklist_entry_type AS ENUM (
    'email',
    'domain'
);

-- 2. Create the main table
CREATE TABLE public.email_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    entry_type public.blacklist_entry_type NOT NULL,

    value TEXT NOT NULL,

    reason TEXT,

    added_by_user_id UUID REFERENCES public.users(id),

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Create a critical index for performance
-- This ensures you can't add the same domain twice
-- and makes lookups extremely fast.
ALTER TABLE public.email_blacklist
ADD CONSTRAINT email_blacklist_type_value_unique UNIQUE (entry_type, value);


-- 4. Create a trigger to update the updated_at column on row modification
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_email_blacklist_updated_at
AFTER UPDATE ON public.email_blacklist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- 5. Add RLS policies

-- Enable RLS
ALTER TABLE public.email_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users from root workspace to manage the blacklist" ON public.email_blacklist
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.workspace_user_linked_users
        WHERE platform_user_id = auth.uid() AND ws_id = '00000000-0000-0000-0000-000000000000'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.workspace_user_linked_users
        WHERE platform_user_id = auth.uid() AND ws_id = '00000000-0000-0000-0000-000000000000'
    )
);