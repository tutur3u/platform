import type { APIRequestContext, Page } from '@playwright/test';

// The retained cold Finance response took 65s (53s in Next.js compilation).
// Preparation gets one bounded attempt; the measured navigation keeps its
// existing 60s default, and the complete fixture keeps its 240s test budget.
const FINANCE_COLD_ROUTE_PREPARATION_TIMEOUT_MS = 90_000;

/** Compile cold satellite routes using the same synthetic account as the UI. */
export async function prepareAccountShapeRoutes({
  contactsRequest,
  contactsBaseUrl,
  financePage,
  financeBaseUrl,
  workspaceId,
}: {
  contactsRequest: Pick<APIRequestContext, 'get'>;
  contactsBaseUrl: string;
  financePage: Pick<Page, 'goto'>;
  financeBaseUrl: string;
  workspaceId: string;
}) {
  const countUrl = new URL(
    '/api/v1/notifications/unread-count',
    contactsBaseUrl
  );
  countUrl.searchParams.set('wsId', workspaceId);
  const listUrl = new URL('/api/v1/notifications', contactsBaseUrl);
  listUrl.search = new URLSearchParams({
    limit: '15',
    offset: '0',
    unreadOnly: 'true',
    readOnly: 'false',
    wsId: workspaceId,
  }).toString();

  for (const url of [countUrl, listUrl]) {
    const response = await contactsRequest.get(url.toString(), {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    if (response.status() !== 200) {
      throw new Error(
        `Account-shape readiness failed: ${url.pathname} returned ${response.status()}`
      );
    }
    // Await the complete JSON body; a listening server or streamed shell alone
    // does not prove the notification route has finished compiling.
    const body = await response.json();
    if (
      !body ||
      typeof body.count !== 'number' ||
      !Number.isFinite(body.count) ||
      (url === listUrl && !Array.isArray(body.notifications))
    ) {
      throw new Error(
        `Account-shape readiness failed: invalid ${url.pathname} body`
      );
    }
  }

  const walletUrl = new URL(`/${workspaceId}/wallets`, financeBaseUrl);
  const response = await financePage.goto(walletUrl.toString(), {
    timeout: FINANCE_COLD_ROUTE_PREPARATION_TIMEOUT_MS,
  });
  if (response?.status() !== 200) {
    throw new Error(
      `Account-shape readiness failed: Finance wallets returned ${response?.status() ?? 'no response'}`
    );
  }
  const responseUrl = new URL(response.url());
  if (
    responseUrl.origin !== walletUrl.origin ||
    !responseUrl.pathname.endsWith(`/${workspaceId}/wallets`) ||
    !response.headers()['content-type']?.includes('text/html')
  ) {
    throw new Error(
      'Account-shape readiness failed: Finance wallets HTML unavailable'
    );
  }
  const error = await response.finished();
  if (error) throw error;
}
