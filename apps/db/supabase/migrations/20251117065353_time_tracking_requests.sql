create type public.time_tracking_request_status as enum (
    'PENDING',
    'APPROVED',
    'REJECTED'
);

create table time_tracking_requests (
    id uuid primary key,
    workspace_id uuid not null references workspaces(id)  on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    task_id uuid references tasks(id) on delete set null,
    category_id uuid references time_tracking_categories(id) on delete set null,
    title text not null,
    description text,
    start_time timestamptz not null,
    end_time timestamptz not null,
    images text[],
    approval_status public.time_tracking_request_status not null default 'PENDING',
    approved_by uuid references users(id) on delete set null, 
    approved_at timestamptz,
    rejected_by uuid references users(id) on delete set null,
    rejected_at timestamptz,
    rejection_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- Add check constraint to limit images array to maximum 5 elements
ALTER TABLE public.time_tracking_requests
ADD CONSTRAINT chk_time_tracking_requests_images_limit
CHECK (array_length(images, 1) <= 5);


-- Add check constraints to ensure data consistency based on approval_status

-- Approved requests must have approved_by and approved_at set
ALTER TABLE time_tracking_requests
ADD CONSTRAINT chk_approved_data
CHECK (
    (approval_status <> 'APPROVED') OR 
    (approved_by IS NOT NULL AND approved_at IS NOT NULL)
);


-- Rejected requests must have rejected_by and rejection_reason set
ALTER TABLE time_tracking_requests
ADD CONSTRAINT chk_rejected_data
CHECK (
    (approval_status <> 'REJECTED') OR 
    (rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
);


-- Pending requests must not have any approval or rejection data set
ALTER TABLE time_tracking_requests
ADD CONSTRAINT chk_pending_data
CHECK (
    (approval_status <> 'PENDING') OR 
    (approved_by IS NULL AND approved_at IS NULL AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL)
);

-- Delete objects first to avoid foreign key constraint violation
delete from storage.objects where bucket_id = 'time_tracking_requests';

delete from storage.buckets where id = 'time_tracking_requests';

-- Migration for creating the 'time_tracking_requests' bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'time_tracking_requests',
  'time_tracking_requests',
  false,
  1048576,
  ARRAY['image/*']
);


CREATE POLICY "Allow creators to upload to their time tracking request folder"
ON storage.objects FOR INSERT -- This policy only applies to new file uploads
WITH CHECK (
    -- 1. Target the correct bucket
    bucket_id = 'time_tracking_requests' AND

    -- 2. Check for authentication
    auth.role() = 'authenticated' AND

    -- 3. Match the authenticated user's ID with the inquiry's creator ID
    auth.uid() = (
    -- Subquery to find the creator of the inquiry
    SELECT ttr.user_id
    FROM public.time_tracking_requests as ttr
    WHERE ttr.id = ((storage.foldername(name))[1])::uuid
    -- Explanation of the line above:
    -- a. `name` is the full path of the file being uploaded, e.g., 'inquiry-id-123/report.pdf'
    -- b. `storage.foldername(name)` returns the path parts as a text array: {'inquiry-id-123', 'report.pdf'}
    -- c. `[1]` extracts the first element from the array, which is the inquiry_id.
    -- d. `::uuid` casts the extracted text to a UUID to match the 'id' column type.
    )
);


CREATE POLICY "Allow creators to view images from their time tracking request folder"
ON storage.objects FOR SELECT -- This policy only applies to file downloads/views
USING (
    -- 1. Target the correct bucket
    bucket_id = 'time_tracking_requests' AND

    -- 2. Check for authentication
    auth.role() = 'authenticated' AND

    -- 3. Match the authenticated user's ID with the inquiry's creator ID
    auth.uid() = (
    -- Subquery to find the creator of the inquiry
    SELECT ttr.user_id
    FROM public.time_tracking_requests as ttr
    WHERE ttr.id = ((storage.foldername(name))[1])::uuid        
    -- Explanation of the line above:
    -- a. `name` is the full path of the file being accessed, e.g., 'inquiry-id-123/report.pdf'
    -- b. `storage.foldername(name)` returns the path parts as a text array: {'inquiry-id-123', 'report.pdf'}
    -- c. `[1]` extracts the first element from the array, which is the inquiry_id.
    -- d. `::uuid` casts the extracted text to a UUID to match the 'id' column type.
    )
);