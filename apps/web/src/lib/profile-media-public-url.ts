import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
export function publicStorageUrl(value: string) {
  const origin = process.env.SUPABASE_PUBLIC_STORAGE_ORIGIN;
  const original = new URL(value);
  if (!origin) {
    if (original.protocol !== 'https:')
      throw new ProfileUploadError(
        'Secure profile storage is unavailable',
        503
      );
    return value;
  }
  const base = new URL(origin);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  ) {
    throw new ProfileUploadError('Secure profile storage is unavailable', 503);
  }
  return new URL(original.pathname + original.search, base.origin).toString();
}
