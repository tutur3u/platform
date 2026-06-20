import { type APIRequestContext, expect, type Page } from '@playwright/test';

const runtimeErrorPatterns = [
  'Application error',
  'Internal Server Error',
  'Unhandled Runtime Error',
  'This page could not be found',
];

export async function expectNoPublicRouteRuntimeError(page: Page) {
  for (const pattern of runtimeErrorPatterns) {
    await expect(
      page.getByText(pattern).first(),
      `Expected public route not to render visible runtime error text: ${pattern}`
    ).toBeHidden();
  }
}

export async function expectPublicRouteRedirect(
  request: APIRequestContext,
  path: string,
  expectedLocation: RegExp | string
) {
  const response = await request.get(path, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });

  expect([301, 302, 303, 307, 308]).toContain(response.status());

  const location = response.headers().location ?? '';
  if (expectedLocation instanceof RegExp) {
    expect(location).toMatch(expectedLocation);
  } else {
    expect(location).toContain(expectedLocation);
  }
}
