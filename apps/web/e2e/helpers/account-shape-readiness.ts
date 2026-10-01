import type { APIRequestContext, Page } from '@playwright/test';

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

  const response = await financePage.goto(
    new URL(`/${workspaceId}/wallets`, financeBaseUrl).toString()
  );
  if (response?.status() !== 200) {
    throw new Error(
      `Account-shape readiness failed: Finance wallets returned ${response?.status() ?? 'no response'}`
    );
  }
  if (
    !new URL(response.url()).pathname.endsWith(`/${workspaceId}/wallets`) ||
    !response.headers()['content-type']?.includes('text/html')
  ) {
    throw new Error(
      'Account-shape readiness failed: Finance wallets HTML unavailable'
    );
  }
  const error = await response.finished();
  if (error) throw error;
}
