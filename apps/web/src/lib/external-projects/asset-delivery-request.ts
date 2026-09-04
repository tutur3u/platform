const VERSIONED_ASSET_DELIVERY_PATH =
  /^\/api\/v1\/workspaces\/[^/]+\/external-projects\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isVersionedExternalProjectAssetDeliveryRequest(
  method: string,
  url: URL
) {
  return (
    (method === 'GET' || method === 'HEAD') &&
    Boolean(url.searchParams.get('v')) &&
    VERSIONED_ASSET_DELIVERY_PATH.test(url.pathname)
  );
}
