import { expect } from '@playwright/test';
import { getLegalDocument } from '@tuturuuu/legal';
import en from '../messages/en.json';
import vi from '../messages/vi.json';
import { config, signIn, test, visit, workspacePath } from './fixtures';
import { localized } from './policy';

test('public native legal pages preserve EN/VI content and reload without a session', async ({
  page,
  acceptanceLocale,
}) => {
  const pages = [
    { kind: 'privacy', slug: 'privacy' },
    { kind: 'terms', slug: 'terms' },
    { kind: 'acceptable-use', slug: 'acceptable-use' },
    { kind: 'dpa', slug: 'legal/dpa' },
    { kind: 'sla', slug: 'legal/sla' },
    { kind: 'subprocessors', slug: 'legal/subprocessors' },
    { kind: 'community-guidelines', slug: 'community-guidelines' },
  ] as const;
  for (const { kind, slug } of pages) {
    const document = getLegalDocument(kind, acceptanceLocale);
    const path = localized(`/${slug}`, acceptanceLocale);
    const response = await page.goto(config.baseURL + path, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    expect(response?.headers()['x-tuturuuu-web-renderer']).toBe('native-Start');
    expect(response?.headers()['set-cookie']).toBeUndefined();
    await expect(page.locator('html')).toHaveAttribute(
      'lang',
      acceptanceLocale
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow'
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `${document.title} ${document.highlightedWord}`
    );
    for (const section of document.sections) {
      await expect(
        page.getByRole('heading', { name: section.title, exact: true })
      ).toBeVisible();
    }
    await expect(page.locator('footer')).toContainText(document.footer);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('signed-in Next fallback retains actor, locale, session and public native navigation', async ({
  page,
  acceptanceLocale,
}) => {
  await signIn(page, acceptanceLocale, workspacePath);
  const response = await page.reload({ waitUntil: 'domcontentloaded' });
  expect(response?.headers()['x-tuturuuu-web-renderer']).toBe('Next-fallback');
  await visit(page, localized('/privacy', acceptanceLocale));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await visit(page, localized(workspacePath, acceptanceLocale));
  expect(new URL(page.url()).pathname).not.toContain('/login');
});

const securityRollback =
  process.env.WAVE1_STAGING_SECURITY_ROLLBACK === 'confirmed';

test('native security documents preserve content, noindex and anonymous reload', async ({
  page,
  acceptanceLocale,
}) => {
  test.skip(securityRollback, 'Separate rollback acceptance pass');
  const messages = acceptanceLocale === 'vi' ? vi : en;
  const policy = messages['security-policy'];
  const bounty = messages['bug-bounty'];
  const pages = [
    {
      slug: 'security/policy',
      copy: policy,
      headings: [
        policy.reporting.title,
        policy.workflow.title,
        policy.scope.title,
        policy.rules.title,
        policy.response.title,
        policy.cta.title,
      ],
    },
    {
      slug: 'security/bug-bounty',
      copy: bounty,
      headings: [
        bounty.community.title,
        bounty.hall.title,
        bounty.program.title,
      ],
    },
  ];
  for (const { slug, copy, headings } of pages) {
    const paths =
      acceptanceLocale === 'en'
        ? [`/${slug}`, localized(`/${slug}`, acceptanceLocale)]
        : [localized(`/${slug}`, acceptanceLocale)];
    for (const path of paths) {
      const response = await page.goto(config.baseURL + path, {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status()).toBe(200);
      expect(response?.headers()['x-tuturuuu-web-renderer']).toBe(
        'native-Start'
      );
      expect(response?.headers()['set-cookie']).toBeUndefined();
      expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
      expect(response?.headers()['cache-control']).toBe('no-store');
      expect(response?.headers()['content-security-policy']).toContain(
        "default-src 'none'"
      );
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        acceptanceLocale
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow'
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `${copy.hero.title_prefix} ${copy.hero.title_highlight}`
      );
      await expect(page.locator('h2')).toHaveText(headings);
      const subheadings =
        slug === 'security/policy'
          ? [
              policy.workflow.steps.private.title,
              policy.workflow.steps.safe.title,
              policy.workflow.steps.credit.title,
              policy.scope.in_scope.title,
              policy.scope.out_of_scope.title,
              policy.rules.badge,
              policy.rules.include.title,
              policy.response.items.ack.title,
              policy.response.items.triage.title,
              policy.response.items.credit.title,
            ]
          : [
              bounty.researchers.rana.name,
              bounty.researchers.vapour.name,
              bounty.program.steps.private.title,
              bounty.program.steps.triage.title,
              bounty.program.steps.scope.title,
              bounty.program.steps.credit.title,
            ];
      await expect(page.locator('h3')).toHaveText(subheadings);
      await expect(page.locator('script')).toHaveCount(0);
      const reload = await page.reload({ waitUntil: 'domcontentloaded' });
      expect(reload?.headers()['x-tuturuuu-web-renderer']).toBe('native-Start');
      expect(reload?.headers()['set-cookie']).toBeUndefined();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  }
});

test('security flag rollback returns both documents to Next independently of legal', async ({
  page,
  acceptanceLocale,
}) => {
  test.skip(
    !securityRollback,
    'Run after owner disables only WEB_START_NATIVE_SECURITY'
  );
  for (const slug of ['security/policy', 'security/bug-bounty']) {
    const paths =
      acceptanceLocale === 'en'
        ? [`/${slug}`, localized(`/${slug}`, acceptanceLocale)]
        : [localized(`/${slug}`, acceptanceLocale)];
    for (const path of paths) {
      const response = await page.goto(config.baseURL + path, {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status()).toBe(200);
      expect(response?.headers()['x-tuturuuu-web-renderer']).toBe(
        'Next-fallback'
      );
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  }
  const legal = await page.goto(
    config.baseURL + localized('/privacy', acceptanceLocale),
    { waitUntil: 'domcontentloaded' }
  );
  expect(legal?.headers()['x-tuturuuu-web-renderer']).toBe('native-Start');
});
