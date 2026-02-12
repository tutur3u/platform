-- Create the 'support_type' ENUM
-- This type can be used for columns that need to store the kind of support request.
CREATE TYPE public.support_type AS ENUM (
    'bug',
    'feature-request',
    'support',
    'job-application'
);

-- Create the 'product' ENUM
-- This type can be used for columns that need to store which product a request is related to.
CREATE TYPE public.product AS ENUM (
    'web',
    'nova',
    'rewise',
    'calendar',
    'finance',
    'tudo',
    'tumeet',
    'shortener',
    'qr',
    'drive',
    'mail',
    'other'
);

-- Add new columns to the support_inquiries table
ALTER TABLE public.support_inquiries 
ADD COLUMN type public.support_type NOT NULL DEFAULT 'support',
ADD COLUMN product public.product NOT NULL DEFAULT 'other',
ADD COLUMN creator_id uuid DEFAULT auth.uid(),
ADD COLUMN images text[];

-- Add foreign key constraint for creator_id to users table with cascade options
ALTER TABLE public.support_inquiries
ADD CONSTRAINT fk_support_inquiries_creator_id 
FOREIGN KEY (creator_id) 
REFERENCES public.users(id) 
ON UPDATE CASCADE 
ON DELETE CASCADE;

-- Add check constraint to limit images array to maximum 5 elements
ALTER TABLE public.support_inquiries
ADD CONSTRAINT chk_support_inquiries_images_limit
CHECK (array_length(images, 1) <= 5);

-- Migration for creating the 'support_inquiries' bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support_inquiries',
  'support_inquiries',
  false,
  1048576,
  ARRAY['image/*']
);

-- POLICY: Allow creators to upload files to their own inquiry folder.
-- This policy applies to the 'support_inquiries' storage bucket.

CREATE POLICY "Allow creators to upload to their inquiry folder"
ON storage.objects FOR INSERT -- This policy only applies to new file uploads
WITH CHECK (
  -- 1. Target the correct bucket
  bucket_id = 'support_inquiries' AND

  -- 2. Check for authentication
  auth.role() = 'authenticated' AND

  -- 3. Match the authenticated user's ID with the inquiry's creator ID
  auth.uid() = (
    -- Subquery to find the creator of the inquiry
    SELECT si.creator_id
    FROM public.support_inquiries as si
    WHERE si.id = ((storage.foldername(name))[1])::uuid
    -- Explanation of the line above:
    -- a. `name` is the full path of the file being uploaded, e.g., 'inquiry-id-123/report.pdf'
    -- b. `storage.foldername(name)` returns the path parts as a text array: {'inquiry-id-123', 'report.pdf'}
    -- c. `[1]` extracts the first element from the array, which is the inquiry_id.
    -- d. `::uuid` casts the extracted text to a UUID to match the 'id' column type.
  )
);

-- POLICY: Allow creators to view/download only image files from their own inquiry folder.
-- This policy applies to the 'support_inquiries' storage bucket.

CREATE POLICY "Allow creators to view images from their inquiry folder"
ON storage.objects FOR SELECT -- This policy only applies to file downloads/views
USING (
  -- 1. Target the correct bucket
  bucket_id = 'support_inquiries' AND

  -- 2. Check for authentication
  auth.role() = 'authenticated' AND

  -- 3. Match the authenticated user's ID with the inquiry's creator ID
  is_org_member(auth.uid(), '00000000-0000-0000-0000-000000000000')
);


create policy "Enable users to view their own data only"

on "public"."support_inquiries"

as PERMISSIVE

for SELECT

to authenticated

using (
  (select auth.uid()) = creator_id
);
