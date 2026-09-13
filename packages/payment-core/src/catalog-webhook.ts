export const PRODUCTION_CATALOG_WEBHOOK_URL =
  'https://pay.tuturuuu.com/api/payment/webhooks';

type CatalogWebhook = {
  organizationId: string;
  url: string;
  enabled: boolean;
  events: readonly string[];
  secret: string;
};

export function assertProductionCatalogWebhook(
  endpoints: readonly CatalogWebhook[],
  organizationId: string,
  deploymentSecret: string | undefined
) {
  const matches = endpoints.filter(
    (endpoint) =>
      endpoint.organizationId === organizationId &&
      endpoint.url === PRODUCTION_CATALOG_WEBHOOK_URL
  );
  if (
    !deploymentSecret ||
    matches.length !== 1 ||
    !matches[0]?.enabled ||
    !matches[0].events.includes('product.updated') ||
    matches[0].secret !== deploymentSecret
  ) {
    throw new Error(
      'Production catalog webhook must be enabled, unique, subscribed to product.updated and match the deployment signing secret; no prices changed'
    );
  }
}

export function assertCatalogWebhookProbe(status: number, body: unknown) {
  // An unsigned request must reach Polar signature validation, not session auth
  // or hosting protection. Its rejection must happen before any event handler.
  if (
    status !== 403 ||
    !body ||
    typeof body !== 'object' ||
    !('received' in body) ||
    body.received !== false
  ) {
    throw new Error(
      'Production webhook signature handler is unreachable; no prices changed'
    );
  }
}
