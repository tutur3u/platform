import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';
import {
  expectNoPublicRouteRuntimeError,
  expectPublicRouteRedirect,
} from './helpers/public-routes';

const productRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/products/ai`,
    heading: 'AI-Powered Solutions',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/calendar`,
    heading: 'Smart Calendar Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/crm`,
    heading: 'Customer Relationship Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/documents`,
    heading: 'Intelligent Document Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/drive`,
    heading: 'Cloud Storage Solution',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/finance`,
    heading: 'Smart Financial Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/inventory`,
    heading: 'Smart Inventory Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/lms`,
    heading: 'Learning Management System',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/mail`,
    heading: 'Smart Email Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/tasks`,
    heading: 'Smart Task Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/workflows`,
    heading: 'Workflow Automation',
  },
];

const legalRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/acceptable-use`,
    heading: 'Acceptable Use',
    summaryHeading: 'Key Policy Points',
  },
  {
    path: `/${DEFAULT_LOCALE}/community-guidelines`,
    heading: 'Community Guidelines',
    summaryHeading: 'Guidelines at a Glance',
  },
  {
    path: `/${DEFAULT_LOCALE}/privacy`,
    heading: 'Privacy Policy',
    summaryHeading: 'Key Privacy Principles',
  },
  {
    path: `/${DEFAULT_LOCALE}/terms`,
    heading: 'Terms of Service',
    summaryHeading: 'Key Points Summary',
  },
];

const staticMarketingRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/about`,
    heading: 'Unlocking Human Potential Through Intelligent Technology',
  },
  {
    path: `/${DEFAULT_LOCALE}/contact`,
    heading: "Let's Build Together",
  },
  {
    path: `/${DEFAULT_LOCALE}/contributors`,
    heading: 'Contributors',
  },
  {
    path: `/${DEFAULT_LOCALE}/women-in-tech`,
    heading:
      'From Vietnam to the World: Women Leading the Future of Technology',
  },
  {
    path: '/vi/about',
    heading: 'Giải Phóng Tiềm Năng Con Người Thông Qua Công Nghệ Thông Minh',
  },
  {
    path: `/${DEFAULT_LOCALE}/partners`,
    heading: 'Our Partners',
  },
  {
    path: `/${DEFAULT_LOCALE}/branding`,
    heading: 'Tuturuuu Branding',
  },
  {
    path: `/${DEFAULT_LOCALE}/blog`,
    heading: 'Insights & Innovation',
  },
  {
    path: `/${DEFAULT_LOCALE}/careers`,
    heading: 'Build the Future of Human Potential',
  },
  {
    path: `/${DEFAULT_LOCALE}/facebook-mockup`,
    heading: 'Facebook Mockup',
  },
  {
    path: `/${DEFAULT_LOCALE}/security`,
    heading: 'Your Security is Our Top Priority',
  },
  {
    path: `/${DEFAULT_LOCALE}/security/bug-bounty`,
    heading: 'Thank you to the people who make Tuturuuu safer',
  },
  {
    path: `/${DEFAULT_LOCALE}/security/policy`,
    heading: 'Tuturuuu security policy for responsible disclosure',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/education`,
    heading: 'Transform Your Educational Institution',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/healthcare`,
    heading: 'Transform Your Healthcare Practice',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/construction`,
    heading: 'Transform Your Construction Business',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/hospitality`,
    heading: 'Transform Your Hospitality Business',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/manufacturing`,
    heading: 'Transform Your Manufacturing Operations',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/pharmacies`,
    heading: 'Modern Solutions for Modern Pharmacies',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/realestate`,
    heading: 'Transform Your Real Estate Business',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/restaurants`,
    heading: 'Transform Your Restaurant Operations',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/retail`,
    heading: 'Transform Your Retail Business',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui`,
    heading: 'Tuturuuu UI',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui/components`,
    heading: 'Components',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui/components/button`,
    heading: 'Button',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui/contributing`,
    heading: 'Contributing',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui/setup`,
    heading: 'Setup',
  },
  {
    path: `/${DEFAULT_LOCALE}/visualizations/horse-racing`,
    heading: 'Horse Racing Algorithm Visualization',
  },
];

const landingRoutes = [{ path: '/' }, { path: `/${DEFAULT_LOCALE}` }];

const qrAppRedirectLocation =
  /^https:\/\/(?:[a-z0-9-]+\.)?qr\.tuturuuu\.localhost(?::\d+)?\/\?utm_source=e2e&tag=a&tag=b$/u;

const redirects = [
  {
    path: `/${DEFAULT_LOCALE}/calendar/meet-together`,
    location: '/meet-together',
  },
  {
    path: `/${DEFAULT_LOCALE}/calendar/meet-together/plans/summer`,
    location: '/meet-together/plans/summer',
  },
  {
    path: `/${DEFAULT_LOCALE}/docs`,
    location: 'https://docs.tuturuuu.com',
  },
  {
    path: `/${DEFAULT_LOCALE}/pricing`,
    location: '/pricing',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/meet-together`,
    location: '/meet-together',
  },
  {
    path: `/${DEFAULT_LOCALE}/qr-generator?utm_source=e2e&tag=a&tag=b`,
    location: qrAppRedirectLocation,
  },
  {
    path: '/pricing',
    location: '/?hash-nav=1#pricing',
  },
  {
    path: '/products/meet-together',
    location: '/meet-together',
  },
  {
    path: '/qr-generator?utm_source=e2e&tag=a&tag=b',
    location: qrAppRedirectLocation,
  },
];

test.describe('Public migrated marketing routes', () => {
  for (const route of productRoutes) {
    test(`renders product route ${route.path}`, async ({ page }) => {
      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
      });

      expect(response?.ok()).toBe(true);
      await expect(
        page.getByRole('heading', { name: route.heading }).first()
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Coming Soon').first()).toBeVisible();
      await expect(page.getByText('Contact Sales').first()).toBeVisible();
      await expectNoPublicRouteRuntimeError(page);
    });
  }

  for (const route of legalRoutes) {
    test(`renders legal route ${route.path}`, async ({ page }) => {
      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
      });

      expect(response?.ok()).toBe(true);
      await expect(
        page.getByRole('heading', { name: route.heading }).first()
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole('heading', { name: route.summaryHeading }).first()
      ).toBeVisible();
      await expect(
        page.getByText('Effective Date: February 6, 2026').first()
      ).toBeVisible();
      await expectNoPublicRouteRuntimeError(page);
    });
  }

  for (const route of landingRoutes) {
    test(`renders landing route ${route.path}`, async ({ page }) => {
      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
      });

      expect(response?.ok()).toBe(true);
      await expect(
        page
          .getByRole('heading', { name: /Work Smarter\.\s+Live Better\./u })
          .first()
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole('heading', { name: 'Everything you need' }).first()
      ).toBeVisible();
      await expect(
        page
          .getByRole('heading', { name: 'Simple pricing. No surprises.' })
          .first()
      ).toBeVisible();
      await expectNoPublicRouteRuntimeError(page);
    });
  }

  for (const route of staticMarketingRoutes) {
    test(`renders static marketing route ${route.path}`, async ({ page }) => {
      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
      });

      expect(response?.ok()).toBe(true);
      await expect(
        page.getByRole('heading', { name: route.heading }).first()
      ).toBeVisible({ timeout: 30_000 });
      await expectNoPublicRouteRuntimeError(page);
    });
  }

  test('renders offline fallback route', async ({ page }) => {
    const response = await page.goto('/~offline', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole('heading', { name: "You're Offline" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
    await expectNoPublicRouteRuntimeError(page);
  });

  for (const redirect of redirects) {
    test(`preserves redirect contract for ${redirect.path}`, async ({
      request,
    }) => {
      await expectPublicRouteRedirect(
        request,
        redirect.path,
        redirect.location
      );
    });
  }
});
