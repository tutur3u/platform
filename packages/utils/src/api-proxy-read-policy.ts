import type { NextRequest } from 'next/server';

const UUID_PATH_SEGMENT =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const FINANCE_INVOICE_CREATE_SUPPORT_READ_PATH_PATTERN = new RegExp(
  `^/api/v1/workspaces/[^/]+/(?:finance/invoices(?:/subscription/context)?|inventory/products|promotions|settings/(?:configs|(?!permissions(?:/|$)|members(?:/|$))[^/]+)|user-groups(?:/linked-products|/${UUID_PATH_SEGMENT}/linked-products)|users(?:/${UUID_PATH_SEGMENT}(?:/(?:linked-promotions|referral-discounts|user-groups))?)?|wallets)/?$`,
  'u'
);
const FINANCE_INVOICE_TRANSACTION_CATEGORIES_PATH_PATTERN =
  /^\/api\/workspaces\/[^/]+\/transactions\/categories\/?$/u;
const FINANCE_READ_PATH_PATTERNS = [
  /^\/api\/workspaces\/[^/]+\/finance(?:\/|$)/u,
  /^\/api\/workspaces\/[^/]+\/transactions(?:\/|$)/u,
  /^\/api\/workspaces\/[^/]+\/wallets(?:\/|$)/u,
  /^\/api\/workspaces\/[^/]+\/tags(?:\/|$)/u,
  /^\/api\/v1\/workspaces\/[^/]+\/finance(?:\/|$)/u,
  /^\/api\/v1\/workspaces\/[^/]+\/wallets(?:\/|$)/u,
] as const;

export function isFinanceInvoiceCreateSupportRead(req: NextRequest) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  return (
    FINANCE_INVOICE_CREATE_SUPPORT_READ_PATH_PATTERN.test(
      req.nextUrl.pathname
    ) ||
    FINANCE_INVOICE_TRANSACTION_CATEGORIES_PATH_PATTERN.test(
      req.nextUrl.pathname
    )
  );
}

export function isFinanceRead(req: NextRequest) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  return FINANCE_READ_PATH_PATTERNS.some((pattern) =>
    pattern.test(req.nextUrl.pathname)
  );
}
