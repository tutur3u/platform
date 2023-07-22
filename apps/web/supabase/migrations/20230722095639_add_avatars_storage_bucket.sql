-- Add a column with id = 'avatars', name = 'avatars', allowed_mime_types = ["image/*"], public = true, avif_autodetection = true, file_size_limit = 2097152
-- into storage.buckets table
-- note that the allowed_mime_types is an array of strings, so we use the array constructor syntax
INSERT INTO storage.buckets (
        id,
        name,
        allowed_mime_types,
        public,
        avif_autodetection,
        file_size_limit
    )
VALUES (
        'avatars',
        'avatars',
        ARRAY ['image/*'],
        true,
        true,
        2097152
    );