import type { ProxyRoutePolicy } from '@tuturuuu/utils/api-proxy-guard';

const FINANCE_INVOICE_API_PATTERN =
  /^\/api\/v1\/workspaces\/[^/]+\/finance\/invoices(?:\/|$)/u;

/**
 * Invoice CRUD is used by Finance directly and by Inventory's manual sales
 * workflow. Give it a dedicated bucket so unrelated Finance mutations cannot
 * strand a cashier behind a shared application-wide limit.
 */
export const FINANCE_INVOICE_ROUTE_POLICY = {
  key: 'finance-invoice-crud',
  matches: (request) =>
    FINANCE_INVOICE_API_PATTERN.test(request.nextUrl.pathname),
  rateLimits: {
    get: [],
    mutate: [
      { duration: '1 m', limit: 120, window: 'minute' },
      { duration: '1 h', limit: 1200, window: 'hour' },
      { duration: '1 d', limit: 10_000, window: 'day' },
    ],
  },
} satisfies ProxyRoutePolicy;
