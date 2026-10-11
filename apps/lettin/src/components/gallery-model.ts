import type { LettinArtwork } from '@tuturuuu/internal-api/lettin';
export function galleryImage(value: string): string | undefined {
  if (/^\/api\/v1\/lettin\/media\/[0-9a-f-]{36}$/.test(value)) return value;
  if (!value.startsWith('https://') || value.length > 2000) return undefined;
  try {
    const url = new URL(value);
    return !url.username && !url.password ? value : undefined;
  } catch {
    return undefined;
  }
}
export function validGallery(items: LettinArtwork[] = []) {
  return (
    items.length <= 12 &&
    items.every(
      (item) =>
        !!galleryImage(item.image) &&
        !!item.alt.trim() &&
        item.alt.trim().length <= 500 &&
        item.caption.length <= 1000 &&
        item.credit.length <= 200
    )
  );
}
