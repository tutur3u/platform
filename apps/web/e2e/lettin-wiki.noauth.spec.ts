import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { startRuntimeHeartbeat } from '../../../scripts/ci/e2e-runtime-heartbeat';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
} from './helpers/environment';
import { runLettinBrowserPhase as phase } from './helpers/lettin-browser-phase';
import { withLettinContextCleanup } from './helpers/lettin-context-cleanup';
import {
  lettinFixturePhase,
  runLettinFixtureCommand,
} from './helpers/lettin-fixture-diagnostics';
import { verifyLettinMarkdownPersistence } from './helpers/lettin-markdown-persistence';
import { verifyLettinPrivateImport } from './helpers/lettin-private-import';
import { assertLettinProfileLimits } from './helpers/lettin-profile-limits';
import { createLettinBrowserContext } from './helpers/lettin-session';
import { syntheticProfileImage } from './helpers/profile-media-fixture';
import {
  deleteRestRows,
  postRestRow,
  SUPABASE_URL,
  serviceHeaders,
} from './helpers/supabase-rest';

const origin = process.env.LETTIN_BASE_URL;
const profileMediaPaths: { bucket: string; path: string }[] = [];
let d1Ready = false;
const workspaceId = randomUUID();
let creatorId: string;
const creatorEmail = `e2e-lettin-${workspaceId}@tuturuuu.com`;
const appDirectory = path.resolve(process.cwd(), '../lettin');
const token = () =>
  createAppSessionToken(
    {
      email: creatorEmail,
      originApp: 'web',
      targetApp: 'lettin',
      userId: creatorId,
    },
    {
      secret:
        process.env.TUTURUUU_APP_COORDINATION_SECRET ??
        LOCAL_E2E_APP_COORDINATION_SECRET,
    }
  ).token;
const draft = (title: string, kind = 'page') => ({
  title,
  kind,
  description: '',
  image: '',
  credit: '',
  tags: [],
  links: [],
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
});
function localSql(sql: string) {
  runLettinFixtureCommand(
    [
      '--no-install',
      'wrangler',
      'd1',
      'execute',
      'LETTIN_DB',
      '--local',
      '--command',
      sql,
    ],
    appDirectory
  );
}

test.describe
  .serial('Tulletin authenticated wiki and guest publishing', () => {
    let stopHeartbeat = () => {};
    test.beforeEach(() => {
      stopHeartbeat = startRuntimeHeartbeat('worker');
    });
    test.afterEach(() => {
      stopHeartbeat();
    });
    test.beforeAll(async ({ request }) => {
      assertSafeE2EEnvironment();
      expect(
        origin,
        'LETTIN_BASE_URL must be provided by the owned satellite runner'
      ).toBeTruthy();
      const account = await lettinFixturePhase('create fixture account', () =>
        request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
          headers: serviceHeaders(),
          data: {
            email: creatorEmail,
            password: randomUUID(),
            email_confirm: true,
          },
        })
      );
      expect(account.status(), await account.text()).toBe(200);
      creatorId = (await account.json()).id;
      expect(creatorId).toMatch(/^[0-9a-f-]{36}$/);
      // Wrangler and Next/OpenNext share the real local D1 persistence directory.
      await lettinFixturePhase('apply D1 migrations', () =>
        runLettinFixtureCommand(
          [
            '--no-install',
            'wrangler',
            'd1',
            'migrations',
            'apply',
            'LETTIN_DB',
            '--local',
          ],
          appDirectory
        )
      );
      d1Ready = true;
      await lettinFixturePhase('seed D1 creator', () =>
        localSql(
          `INSERT OR IGNORE INTO creators(user_id) VALUES ('${creatorId}')`
        )
      );
      await lettinFixturePhase('seed fixture workspace', () =>
        postRestRow({
          request,
          table: 'workspaces',
          data: {
            id: workspaceId,
            creator_id: creatorId,
            name: 'Synthetic Tulletin E2E',
            personal: false,
            handle: `e2e-lettin-${workspaceId.slice(0, 8)}`,
          },
        })
      );
    });
    test.afterAll(async ({ request }) => {
      if (!creatorId) return;
      for (const { bucket, path } of profileMediaPaths) {
        if (!path?.startsWith(`${creatorId}/`))
          throw new Error('Unsafe profile fixture cleanup path');
        await lettinFixturePhase('delete fixture media', () =>
          request.delete(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
            headers: serviceHeaders(),
            data: { prefixes: [path] },
          })
        );
      }
      if (d1Ready)
        await lettinFixturePhase('delete D1 fixtures', () =>
          localSql(
            `DELETE FROM import_previews WHERE ws_id='${workspaceId}'; DELETE FROM creator_blacklist WHERE ws_id='${workspaceId}'; DELETE FROM worlds WHERE ws_id='${workspaceId}'; DELETE FROM creator_profiles WHERE user_id='${creatorId}'; DELETE FROM creators WHERE user_id='${creatorId}'`
          )
        );
      await lettinFixturePhase('delete fixture workspace', () =>
        deleteRestRows({
          request,
          table: 'workspaces',
          filter: `id=eq.${workspaceId}`,
        })
      );
      await lettinFixturePhase('delete fixture account', () =>
        request.delete(`${SUPABASE_URL}/auth/v1/admin/users/${creatorId}`, {
          headers: serviceHeaders(),
        })
      );
    });

    test('creates a project in the browser, edits Markdown, saves, and reloads', async ({
      browser,
    }) => {
      test.setTimeout(180000);
      const session = token();
      const context = await createLettinBrowserContext(
        browser,
        origin!,
        session
      );
      await withLettinContextCleanup(
        context,
        () => verifyLettinMarkdownPersistence(context, origin!, workspaceId),
        'Markdown'
      );
    });

    test('serves dedicated timeline and relationship pages and filters unpublished targets for guests', async ({
      browser,
      request,
    }) => {
      test.setTimeout(180000);
      const headers = { authorization: `Bearer ${token()}` };
      const api = `${origin}/api/v1/workspaces/${workspaceId}/lettin`;
      const command = async (data: unknown) => {
        const response = await request.post(api, { headers, data });
        expect(response.status(), await response.text()).toBe(200);
        return response.json();
      };
      const world = await command({
        action: 'createWorld',
        draft: {
          ...draft('Synthetic published atlas', 'world'),
          theme: { palette: 'forest', typography: 'clean', motion: 'reduced' },
        },
      });
      const privateEntry = await command({
        action: 'createEntry',
        worldId: world.id,
        draft: draft('Unpublished secret character', 'character'),
      });
      const event = await command({
        action: 'createEntry',
        worldId: world.id,
        draft: draft('Synthetic crossing', 'event'),
      });
      await command({
        action: 'saveEntry',
        worldId: world.id,
        entryId: event.id,
        version: 1,
        draft: {
          ...draft('Synthetic crossing', 'event'),
          wiki: {
            aliases: ['Crossing'],
            facts: [],
            chronology: { order: -10, label: 'Before the first age', era: '' },
            relationships: [
              {
                targetId: privateEntry.id,
                kind: 'appears',
                label: 'Private relationship',
              },
            ],
          },
        },
      });
      await command({
        action: 'publishEntry',
        worldId: world.id,
        entryId: event.id,
        version: 2,
      });
      await command({ action: 'publishWorld', worldId: world.id, version: 1 });
      const context = await createLettinBrowserContext(
        browser,
        origin!,
        headers.authorization.slice(7)
      );
      try {
        const page = await lettinFixturePhase('create timeline page', () =>
          context.newPage()
        );
        await lettinFixturePhase('open timeline', () =>
          page.goto(`${origin}/${workspaceId}/wiki/${world.id}/timeline`)
        );
        await lettinFixturePhase('confirm timeline', async () => {
          await expect(page.locator('.wiki-studio')).toContainText(
            'Before the first age'
          );
        });
        await lettinFixturePhase('open relationships', () =>
          page.goto(`${origin}/${workspaceId}/wiki/${world.id}/relationships`)
        );
        await lettinFixturePhase('confirm relationships', async () => {
          await expect(page.locator('.wiki-connections')).toContainText(
            'Unpublished secret character'
          );
        });
      } finally {
        await lettinFixturePhase('close timeline context', () =>
          context.close()
        );
      }
      const publicResponse = await request.get(
        `${origin}/api/v1/lettin/worlds?worldId=${world.id}`
      );
      expect(publicResponse.status()).toBe(200);
      const published = await publicResponse.text();
      expect(published).not.toContain(privateEntry.id);
      expect(published).not.toContain('Private relationship');
      const guest = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        const page = await guest.newPage();
        await page.goto(`${origin}/worlds/${world.id}`);
        const publicWorld = page.getByRole('main');
        await expect(publicWorld).toBeVisible();
        await expect(publicWorld).toHaveAttribute('data-wiki-theme', 'forest');
        await expect(
          page.getByText('Unpublished secret character')
        ).toHaveCount(0);
        await expect(publicWorld).toHaveAttribute(
          'data-wiki-motion',
          'reduced'
        );
        const privateResponse = await guest.request.get(api);
        expect(privateResponse.status()).toBe(401);
        const importResponse = await guest.request.post(`${api}/exocorpse`, {
          data: {
            action: 'preview',
            source: 'cms',
            title: 'Unauthorized import',
          },
        });
        expect(importResponse.status()).toBe(401);
      } finally {
        await guest.close();
      }
    });

    test('manages a private blacklist through the real browser and API', async ({
      browser,
      request,
    }) => {
      test.setTimeout(180000);
      const headers = { authorization: `Bearer ${token()}` };
      const context = await createLettinBrowserContext(
        browser,
        origin!,
        headers.authorization.slice(7)
      );
      try {
        const page = await context.newPage();
        await page.goto(`${origin}/${workspaceId}/moderation`);
        await page
          .getByLabel('Account or name', { exact: true })
          .fill('Synthetic blocked account');
        await page
          .getByLabel('Private notes', { exact: true })
          .fill('Synthetic private safety note');
        await page
          .getByRole('button', { name: 'Add to blacklist', exact: true })
          .click();
        await expect(
          page.getByText('Synthetic blocked account', { exact: true })
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByText('Synthetic private safety note', { exact: true })
        ).toBeVisible();
      } finally {
        await context.close();
      }
      const guest = await request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/lettin/moderation`
      );
      expect(guest.status()).toBe(401);
    });

    test('imports a canonical export in the browser as private drafts', async ({
      browser,
    }) => {
      test.setTimeout(180000);
      const context = await createLettinBrowserContext(
        browser,
        origin!,
        token()
      );
      await verifyLettinPrivateImport(context, origin!, workspaceId);
    });

    test('saves canonical identity and a rich About profile with reload persistence', async ({
      browser,
    }) => {
      test.setTimeout(180000);
      const context = await createLettinBrowserContext(
        browser,
        origin!,
        token()
      );
      await withLettinContextCleanup(
        context,
        async () => {
          const page = await phase('create profile page', () =>
            context.newPage()
          );
          await phase('open profile', () =>
            page.goto(`${origin}/${workspaceId}/profile`)
          );
          const username = `synthetic_${workspaceId.replaceAll('-', '').slice(0, 16)}`;
          await phase('edit canonical identity', async () => {
            await page
              .getByLabel('Display name', { exact: true })
              .fill('Synthetic storyteller');
            for (const invalid of ['four', 'google', 'apple', 'microsoft']) {
              await page.getByLabel('Username', { exact: true }).fill(invalid);
              await expect(
                page.getByRole('button', { name: 'Save profile', exact: true })
              ).toBeDisabled();
            }
            await page.getByLabel('Username', { exact: true }).fill(username);
          });
          await phase('upload profile banner', async () => {
            const bannerTicketResponse = page.waitForResponse(
              (response) =>
                response.url().endsWith('/api/v1/users/me/banner/upload-url') &&
                response.request().method() === 'POST'
            );
            const bannerFinalizationResponse = page.waitForResponse(
              (response) =>
                response.url().endsWith('/api/v1/users/me/banner') &&
                response.request().method() === 'POST' &&
                response.request().postDataJSON()?.action === 'finalize'
            );
            await page
              .getByLabel('Banner image', { exact: true })
              .setInputFiles({
                name: 'synthetic-banner.png',
                mimeType: 'image/png',
                buffer: syntheticProfileImage(),
              });
            const signedBannerResponse = await bannerTicketResponse;
            expect(
              signedBannerResponse.ok(),
              await signedBannerResponse.text()
            ).toBe(true);
            const bannerTicket = await signedBannerResponse.json();
            profileMediaPaths.push({
              bucket: 'banners',
              path: bannerTicket.filePath,
            });
            const finalizedBanner = await bannerFinalizationResponse;
            expect(finalizedBanner.status()).toBe(200);
            expect(finalizedBanner.request().postDataJSON().operationId).toBe(
              bannerTicket.operationId
            );
            const storedBanner = await page.request.get(bannerTicket.publicUrl);
            expect(storedBanner.status()).toBe(200);
            expect((await storedBanner.body()).length).toBeLessThanOrEqual(
              2_000_000
            );
            expect(storedBanner.headers()['content-type']).toContain(
              'image/webp'
            );
          });
          await phase('save canonical identity', async () => {
            await expect(
              page.getByRole('button', { name: 'Save profile', exact: true })
            ).toBeEnabled();
            await page
              .getByRole('button', { name: 'Save profile', exact: true })
              .click();
            await expect(
              page.getByText('Profile saved', { exact: true })
            ).toBeVisible();
            const response = await context.request.get(
              `${origin}/api/v1/users/me/profile`
            );
            expect(response.status(), await response.text()).toBe(200);
            expect(await response.json()).toMatchObject({
              id: creatorId,
              handle: username,
              banner_url: expect.stringContaining(`/banners/${creatorId}/`),
            });
          });
          await phase('verify profile limits', async () => {
            await page
              .getByLabel('Username', { exact: true })
              .fill(`${username}_new`);
            await page
              .getByRole('button', { name: 'Save profile', exact: true })
              .click();
            await expect(
              page.getByText(
                'You can change your username once every 14 days.',
                {
                  exact: true,
                }
              )
            ).toBeVisible();
            await page
              .getByRole('button', { name: 'Cancel', exact: true })
              .click();
            await assertLettinProfileLimits(
              context.request,
              origin!,
              username,
              (ticket) => profileMediaPaths.push(ticket)
            );
          });
          await phase('save rich About profile', async () => {
            await page
              .getByRole('button', { name: 'About you', exact: true })
              .click();
            await page
              .getByLabel('Creative headline', { exact: true })
              .fill('Synthetic worldbuilder');
            await page
              .getByLabel('Pronouns', { exact: true })
              .fill('they/them');
            await page
              .getByRole('button', { name: 'Markdown', exact: true })
              .click();
            await page
              .getByLabel('Markdown source', { exact: true })
              .fill('## Synthetic background\n\n**Building quiet worlds.**');
            await page
              .getByRole('button', { name: 'Apply Markdown', exact: true })
              .click();
            await page
              .getByRole('button', { name: 'Save profile', exact: true })
              .click();
            await expect(
              page.getByText('Profile saved', { exact: true })
            ).toBeVisible();
          });
          await phase('reload persisted profile', async () => {
            await page.reload();
            await page
              .getByRole('button', { name: 'About you', exact: true })
              .click();
            await expect(
              page.getByLabel('Creative headline', { exact: true })
            ).toHaveValue('Synthetic worldbuilder');
            await expect(page.locator('.notebook-prose')).toContainText(
              'Building quiet worlds.'
            );
          });
          await phase('verify public creator profile', async () => {
            await page.goto(`${origin}/creators/${username}`);
            await expect(
              page.getByText('Synthetic worldbuilder', { exact: true })
            ).toBeVisible();
            await expect(
              page.getByText(creatorEmail, { exact: true })
            ).toHaveCount(0);
          });
        },
        'profile'
      );
    });

    test('hides imports from an ordinary creator and rejects direct calls', async ({
      browser,
      request,
    }) => {
      test.setTimeout(180000);
      const account = await request.post(
        `${SUPABASE_URL}/auth/v1/admin/users`,
        {
          headers: serviceHeaders(),
          data: {
            email: `synthetic-${workspaceId}@example.test`,
            password: randomUUID(),
            email_confirm: true,
          },
        }
      );
      expect(account.status()).toBe(200);
      const user = await account.json();
      const roleId = randomUUID();
      let context: import('@playwright/test').BrowserContext | undefined;
      try {
        await postRestRow({
          request,
          table: 'workspace_members',
          data: { type: 'MEMBER', user_id: user.id, ws_id: workspaceId },
        });
        await postRestRow({
          request,
          table: 'workspace_roles',
          data: {
            id: roleId,
            name: 'Synthetic documents role',
            ws_id: workspaceId,
          },
        });
        await postRestRow({
          request,
          table: 'workspace_role_permissions',
          data: {
            enabled: true,
            permission: 'manage_documents',
            role_id: roleId,
            ws_id: workspaceId,
          },
        });
        await postRestRow({
          request,
          table: 'workspace_role_members',
          data: { role_id: roleId, user_id: user.id },
        });
        localSql(`INSERT INTO creators(user_id) VALUES ('${user.id}')`);
        const session = createAppSessionToken(
          {
            email: user.email,
            originApp: 'web',
            targetApp: 'lettin',
            userId: user.id,
          },
          {
            secret:
              process.env.TUTURUUU_APP_COORDINATION_SECRET ??
              LOCAL_E2E_APP_COORDINATION_SECRET,
          }
        ).token;
        context = await createLettinBrowserContext(browser, origin!, session);
        const page = await context.newPage();
        await page.goto(`${origin}/${workspaceId}/wiki`);
        await expect(
          page.getByRole('button', { name: 'Start a project', exact: true })
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Import Exocorpse', exact: true })
        ).toHaveCount(0);
        const response = await context.request.post(
          `${origin}/api/v1/workspaces/${workspaceId}/lettin/exocorpse`,
          {
            data: {
              action: 'preview',
              source: 'file',
              title: 'Forbidden import',
              payload: {
                entries: [
                  {
                    stableSourceId: 'synthetic',
                    collectionSlug: 'characters',
                    title: 'Synthetic',
                  },
                ],
              },
            },
          }
        );
        expect(response.status()).toBe(403);
      } finally {
        await context?.close();
        localSql(`DELETE FROM creators WHERE user_id='${user.id}'`);
        await request.delete(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
          headers: serviceHeaders(),
        });
        await deleteRestRows({
          request,
          table: 'workspace_roles',
          filter: `id=eq.${roleId}`,
        });
      }
    });
  });
