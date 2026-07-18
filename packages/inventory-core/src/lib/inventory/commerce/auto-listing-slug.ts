export function getDefaultStorefrontSlug(wsId: string) {
  return `store-${wsId.replaceAll('-', '').slice(0, 12).toLowerCase()}`;
}
