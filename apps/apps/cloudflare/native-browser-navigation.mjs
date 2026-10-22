import assert from 'node:assert/strict';
import { withNativeBrowserFence } from './native-browser-fence.mjs';

export const nativeRedirectCases = [
  { input: '?tag=1&tag=2', output: '?tag=1&tag=2&source=apps' },
  {
    input:
      '?tag=one&__proto__=keep&tag=two&constructor=ctor&prototype=proto&toString=text&json=%5B1%2C2%5D&next=%2Fpersonal%3Fx%3D1&utm_source=fixture',
    output:
      '?tag=one&__proto__=keep&tag=two&constructor=ctor&prototype=proto&toString=text&json=%5B1%2C2%5D&next=%2Fpersonal%3Fx%3D1&utm_source=fixture&source=apps',
  },
  {
    input:
      '?source=one&tag=a&source=two&next=%2Fpersonal&tracking=a%2Bb&empty=&flag',
    output:
      '?source=one&tag=a&source=two&next=%2Fpersonal&tracking=a%2Bb&empty=&flag=',
  },
  {
    input:
      '?2=two&1=one&2=again&source=&next=%2Fpersonal&space=a%20b&plus=%2B&=empty-name',
    output:
      '?2=two&1=one&2=again&source=&next=%2Fpersonal&space=a+b&plus=%2B&=empty-name',
  },
];

export async function verifyNativeBrowserNavigation(browser, origin, fixtures) {
  return withNativeBrowserFence(
    browser,
    origin,
    fixtures.map((app) => app.origin),
    async (page) => {
      for (const app of fixtures) {
        for (const query of nativeRedirectCases) {
          const catalogue = await page.goto(origin);
          assert.equal(catalogue?.status(), 200);
          const anchor = page.locator(`a[href="/${app.slug}"]`);
          await anchor.evaluate((element, href) => {
            element.setAttribute('id', 'native-query-regression');
            element.setAttribute('href', href);
          }, `/${app.slug}/a%2Fb${query.input}`);
          const requestUrl = new URL(`/${app.slug}/a%2Fb${query.input}`, origin)
            .href;
          const redirect = page.waitForResponse(
            (response) =>
              response.url() === requestUrl && response.status() === 307
          );
          void redirect.catch(() => {});
          await page.locator('#native-query-regression').click();
          const response = await redirect;
          assert.equal(
            response.headers().location,
            `${app.origin}/a%2Fb${query.output}`
          );
          await page.waitForURL(
            (url) => url.href === `${app.origin}/a%2Fb${query.output}`
          );
          assert.equal(page.url(), `${app.origin}/a%2Fb${query.output}`);
        }
      }
    }
  );
}
