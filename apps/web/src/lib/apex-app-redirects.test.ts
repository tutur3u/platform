import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';
import {
  handleFinanceAppRedirectRoute,
  redirectToToolsApp,
} from './apex-app-redirects';

vi.mock('@tuturuuu/utils/app-mounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/utils/app-mounts')>()),
  APEX_MIGRATION_ACTIVE: false,
}));

afterEach(() => vi.unstubAllEnvs());

it('keeps existing Web redirects before Apex activation', () => {
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'finance');
  vi.stubEnv('FINANCE_APP_URL', 'https://finance.tuturuuu.com');
  vi.stubEnv('TOOLS_APP_URL', 'https://tools.tuturuuu.com');
  const finance = handleFinanceAppRedirectRoute(
    new NextRequest(
      'https://tuturuuu.com/vi/personal/finance/invoices?ref=a%2Fb&ref=x'
    )
  );
  expect(finance?.headers.get('location')).toBe(
    'https://finance.tuturuuu.com/personal/invoices?ref=a%2Fb&ref=x'
  );

  const tools = redirectToToolsApp(
    new NextRequest('https://tuturuuu.com/qr-generator?value=hello'),
    '/qr'
  );
  expect(tools.headers.get('location')).toBe(
    'https://tools.tuturuuu.com/qr?value=hello'
  );
});
