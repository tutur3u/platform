import type { SupabaseClient } from '@tutur3u/supabase/next/client';

export async function downloadPublicObject({
  supabase,
  bucket,
  path,
  beforeStart,
  onComplete,
  onSuccess,
  onError,
}: {
  supabase: SupabaseClient;
  bucket: string;
  path: string;
  beforeStart?: () => void;
  onComplete?: () => void;
  onSuccess?: (url: string) => void;
  onError?: (error: unknown) => void;
}) {
  try {
    beforeStart?.();

    const {
      data: { publicUrl: url },
    } = supabase.storage.from(bucket).getPublicUrl(path);

    onSuccess?.(url);
    return url;
  } catch (error) {
    console.log('Error downloading object: ', error);
    onError?.(error);
  } finally {
    onComplete?.();
  }
}

export async function downloadPrivateObject({
  supabase,
  bucket,
  path,
  beforeStart,
  onComplete,
  onSuccess,
  onError,
}: {
  supabase: SupabaseClient;
  bucket: string;
  path: string;
  beforeStart?: () => void;
  onComplete?: () => void;
  onSuccess?: (url: string) => void;
  onError?: (error: unknown) => void;
}) {
  try {
    beforeStart?.();

    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) {
      throw error;
    }

    const url = URL.createObjectURL(data);
    onSuccess?.(url);
  } catch (error) {
    console.log('Error downloading object: ', error);
    onError?.(error);
  } finally {
    onComplete?.();
  }
}

export async function uploadObject({
  supabase,
  bucket,
  path,
  file,
  beforeStart,
  onComplete,
  onSuccess,
  onError,
}: {
  supabase: SupabaseClient;
  bucket: string;
  path: string;
  file: File | null;
  beforeStart?: () => void;
  onComplete?: () => void;
  onSuccess?: (url: string) => void;
  onError?: (error: unknown) => void;
}) {
  try {
    beforeStart?.();

    if (!file) throw new Error('You must select an object to upload.');

    const fileExt = file.name.split('.').pop();
    const filePath = `${path}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    onSuccess?.(filePath);
  } catch (error) {
    console.log('Error uploading object: ', error);
    onError?.(error);
  } finally {
    onComplete?.();
  }
}
