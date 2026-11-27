import { expect, test } from '@playwright/test';
import {
  buildSupabaseBrowserCookies,
  cookiesToHeader,
  resolvePersonalMailboxId,
  signInWithPassword,
} from './helpers/auth';
import { assertSafeMailE2EEnvironment } from './helpers/environment';

const ACCOUNT_A = {
  email: 'local@tuturuuu.com',
  password: 'password123',
} as const;

const ACCOUNT_B = {
  email: 'user1@tuturuuu.com',
  password: 'password123',
} as const;

test.describe('Mail account switch recovery', () => {
  const env = assertSafeMailE2EEnvironment();

  test('recovers mailbox selection without 500 or dead-end when session switches to another account', async ({
    browser,
  }) => {
    const [sessionA, sessionB] = await Promise.all([
      signInWithPassword({
        email: ACCOUNT_A.email,
        password: ACCOUNT_A.password,
        supabasePublishableKey: env.supabasePublishableKey,
        supabaseUrl: env.supabaseUrl,
      }),
      signInWithPassword({
        email: ACCOUNT_B.email,
        password: ACCOUNT_B.password,
        supabasePublishableKey: env.supabasePublishableKey,
        supabaseUrl: env.supabaseUrl,
      }),
    ]);

    const cookiesA = buildSupabaseBrowserCookies({
      mailUrl: env.mailUrl,
      session: sessionA,
      supabaseUrl: env.supabaseUrl,
    });
    const cookiesB = buildSupabaseBrowserCookies({
      mailUrl: env.mailUrl,
      session: sessionB,
      supabaseUrl: env.supabaseUrl,
    });

    const [mailboxA, mailboxB] = await Promise.all([
      resolvePersonalMailboxId({ cookies: cookiesA, mailUrl: env.mailUrl }),
      resolvePersonalMailboxId({ cookies: cookiesB, mailUrl: env.mailUrl }),
    ]);
    expect(mailboxA).not.toBe(mailboxB);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // 1. Open Mail as Account A and confirm A's mailbox + account-scoped hint.
      await context.addCookies(cookiesA);
      await page.goto(`${env.mailUrl}/personal/inbox?mailbox=${mailboxA}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByText(ACCOUNT_A.email).first()).toBeVisible({
        timeout: 20_000,
      });

      const hintKeyA = `tuturuuu-mail-default-mailbox:${sessionA.user.id}:personal`;
      await expect
        .poll(() =>
          page.evaluate((key) => window.localStorage.getItem(key), hintKeyA)
        )
        .toBe(mailboxA);

      // 2. Simulate an account switch in another tab: replace session cookies
      //    with Account B without reloading the open Mail tab.
      await context.clearCookies();
      await context.addCookies(cookiesB);

      // 3. Navigate to Snoozed then Inbox. Recovery must switch to Account B's
      //    mailbox rather than rendering a 500 or "No mailboxes available".
      await page
        .getByRole('link', { name: /^Snoozed$/ })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`mailbox=${mailboxB}`), {
        timeout: 20_000,
      });
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.getByText('No mailboxes available')).toHaveCount(0);
      await expect(
        page.getByText('Could not update the conversation')
      ).toHaveCount(0);

      await page
        .getByRole('link', { name: /^Inbox\b/ })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`mailbox=${mailboxB}`), {
        timeout: 20_000,
      });
      await expect(page.getByText(ACCOUNT_B.email).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText('No mailboxes available')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('redirects or recovers cleanly when visiting a foreign mailbox URL as Account B and refuses cross-account PATCH', async ({
    browser,
  }) => {
    const [sessionA, sessionB] = await Promise.all([
      signInWithPassword({
        email: ACCOUNT_A.email,
        password: ACCOUNT_A.password,
        supabasePublishableKey: env.supabasePublishableKey,
        supabaseUrl: env.supabaseUrl,
      }),
      signInWithPassword({
        email: ACCOUNT_B.email,
        password: ACCOUNT_B.password,
        supabasePublishableKey: env.supabasePublishableKey,
        supabaseUrl: env.supabaseUrl,
      }),
    ]);

    const cookiesA = buildSupabaseBrowserCookies({
      mailUrl: env.mailUrl,
      session: sessionA,
      supabaseUrl: env.supabaseUrl,
    });
    const cookiesB = buildSupabaseBrowserCookies({
      mailUrl: env.mailUrl,
      session: sessionB,
      supabaseUrl: env.supabaseUrl,
    });

    const [mailboxA, mailboxB] = await Promise.all([
      resolvePersonalMailboxId({ cookies: cookiesA, mailUrl: env.mailUrl }),
      resolvePersonalMailboxId({ cookies: cookiesB, mailUrl: env.mailUrl }),
    ]);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Only Account B's Supabase cookie (no app-session cookie): verifies
      // silent session resolution and foreign-mailbox recovery with no 500.
      await context.addCookies(cookiesB);
      const response = await page.goto(
        `${env.mailUrl}/personal/snoozed?connected=&mailbox=${mailboxA}`,
        { waitUntil: 'domcontentloaded' }
      );
      expect(response?.status()).toBeLessThan(500);

      await expect(page).not.toHaveURL(/\/login/u);
      await expect(page).toHaveURL(new RegExp(`mailbox=${mailboxB}`), {
        timeout: 20_000,
      });
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.getByText(ACCOUNT_B.email).first()).toBeVisible({
        timeout: 20_000,
      });

      // Prove mailboxA exists and is accessible to Account A before asserting B is refused.
      const ownerOrgRes = await fetch(
        `${env.mailUrl}/api/v1/workspaces/personal/mail/mailboxes/${mailboxA}/organization`,
        { headers: { cookie: cookiesToHeader(cookiesA) } }
      );
      expect(ownerOrgRes.status).toBe(200);

      const ownerThreadsRes = await fetch(
        `${env.mailUrl}/api/v1/workspaces/personal/mail/mailboxes/${mailboxA}/threads?folder=inbox&page=1&pageSize=1`,
        { headers: { cookie: cookiesToHeader(cookiesA) } }
      );
      expect(ownerThreadsRes.status).toBe(200);
      const ownerThreadsBody = (await ownerThreadsRes.json()) as {
        threads?: Array<{ id: string }>;
      };
      const existingThreadA = ownerThreadsBody.threads?.[0]?.id ?? null;

      // Server authorization remains strict: Account B is refused on Account A's
      // real mailbox (403 on organization read) and cannot PATCH A's real thread.
      const crossAccountOrgStatus = await page.evaluate(
        async (foreignMailboxId) => {
          const res = await fetch(
            `/api/v1/workspaces/personal/mail/mailboxes/${foreignMailboxId}/organization`,
            { credentials: 'include' }
          );
          return res.status;
        },
        mailboxA
      );
      expect(crossAccountOrgStatus).toBe(403);

      if (existingThreadA) {
        const ownerThreadRes = await fetch(
          `${env.mailUrl}/api/v1/workspaces/personal/mail/mailboxes/${mailboxA}/threads/${existingThreadA}`,
          { headers: { cookie: cookiesToHeader(cookiesA) } }
        );
        expect(ownerThreadRes.status).toBe(200);

        const patchStatus = await page.evaluate(
          async ({ foreignMailboxId, threadId }) => {
            const res = await fetch(
              `/api/v1/workspaces/personal/mail/mailboxes/${foreignMailboxId}/threads/${threadId}`,
              {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'mark_read' }),
              }
            );
            return res.status;
          },
          { foreignMailboxId: mailboxA, threadId: existingThreadA }
        );
        expect(patchStatus).toBe(404);
      }
    } finally {
      await context.close();
    }
  });
});
