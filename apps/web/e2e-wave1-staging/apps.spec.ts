import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { z } from 'zod';
import { config, input, signIn, test } from './fixtures';

// Node request contexts do not inherit browser routing. This helper admits only
// this staging origin and explicitly disables redirect following.
async function redirect(page: import('@playwright/test').Page, path: string) {
  const url = new URL(path, config.baseURL);
  expect(url.origin).toBe(config.baseURL);
  return page.request.get(url.href, { maxRedirects: 0 });
}

test('signed-in catalogue, redirects and exact-source canonical fence evidence', async ({
  page,
  acceptanceLocale,
}) => {
  await signIn(page, acceptanceLocale, '/');
  await expect(
    page.getByRole('link', { name: /calendar|lịch/iu }).first()
  ).toBeVisible();
  const first = await redirect(
    page,
    `/${acceptanceLocale}/meet/a%2Fb?tag=1&tag=2`
  );
  expect(first.status()).toBe(307);
  const local = new URL(first.headers().location ?? '', config.baseURL);
  expect(local.origin).toBe(config.baseURL);
  expect(local.pathname).toBe('/meet/a%2Fb');
  expect(local.searchParams.getAll('tag')).toEqual(['1', '2']);
  const second = await redirect(page, `${local.pathname}${local.search}`);
  expect(second.status()).toBe(307);
  const target = new URL(second.headers().location ?? '');
  expect(target.origin).toBe('https://meet.staging.tutur3u.com');
  expect(target.pathname).toBe('/a%2Fb');
  expect(target.searchParams.getAll('tag')).toEqual(['1', '2']);
  expect(target.searchParams.get('source')).toBe('apps');
  // A canonical Host probe over public staging ingress would address production.
  // Consume the matching real workerd browser receipt instead.
  const receipt = z
    .object({
      schema: z.literal(1),
      mode: z.literal('browser'),
      sourceSHA: z.string(),
      completed: z.array(z.string()),
      errors: z.array(z.unknown()),
    })
    .parse(
      JSON.parse(readFileSync(input('APPS_CANONICAL_FENCE_RECEIPT'), 'utf8'))
    );
  expect(receipt.sourceSHA).toBe(config.sha);
  expect(receipt.completed).toContain('canonical');
  expect(receipt.errors).toEqual([]);
});
