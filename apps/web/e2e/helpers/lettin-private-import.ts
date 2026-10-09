import { type BrowserContext, expect } from '@playwright/test';
import { runLettinBrowserPhase as importPhase } from './lettin-browser-phase';
import { withLettinContextCleanup } from './lettin-context-cleanup';
import type { LettinSessionRequestOptions } from './lettin-session';

export async function verifyLettinPrivateImport(
  context: BrowserContext,
  origin: string,
  workspaceId: string,
  sessionOptions: LettinSessionRequestOptions
) {
  return withLettinContextCleanup(context, async () => {
    context.setDefaultTimeout(15_000);
    const page = await importPhase('create import page', () =>
      context.newPage()
    );
    await importPhase('open import wiki', () =>
      page.goto(`${origin}/${workspaceId}/wiki`, { timeout: 60_000 })
    );
    await importPhase('open import dialog', () =>
      page
        .getByRole('button', { name: 'Import Exocorpse', exact: true })
        .click()
    );
    const dialog = page.getByRole('dialog');
    await importPhase('configure import file', async () => {
      await dialog
        .getByLabel('Title', { exact: true })
        .fill('Synthetic imported notebook');
      await dialog.getByLabel('Source', { exact: true }).selectOption('file');
    });
    await importPhase('upload canonical export', () =>
      dialog
        .getByLabel('Canonical JSON export', { exact: true })
        .setInputFiles({
          name: 'synthetic-export.json',
          mimeType: 'application/json',
          buffer: Buffer.from(
            JSON.stringify({
              adapter: 'exocorpse',
              entries: [
                {
                  entry: {
                    stableSourceId: 'synthetic-hero',
                    collectionSlug: 'characters',
                    title: 'Synthetic imported hero',
                  },
                  blocks: [
                    {
                      blockType: 'markdown',
                      content: { markdown: '**Synthetic biography**' },
                    },
                  ],
                },
                {
                  entry: {
                    stableSourceId: 'synthetic-blacklist',
                    collectionSlug: 'commission-blacklist',
                    title: 'Synthetic private imported account',
                    summary: 'Synthetic private note',
                  },
                },
              ],
            })
          ),
        })
    );
    await importPhase('review canonical export', async () => {
      const [response] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response
              .url()
              .endsWith(`/api/v1/workspaces/${workspaceId}/lettin/exocorpse`) &&
            response.request().method() === 'POST',
          { timeout: 45_000 }
        ),
        dialog
          .getByRole('button', { name: 'Review import', exact: true })
          .click(),
      ]);
      expect(response.status()).toBe(200);
    });
    await importPhase('confirm canonical preview', async () => {
      await expect(
        dialog.getByText('Synthetic imported hero', { exact: true })
      ).toBeVisible();
    });
    await importPhase('apply private import', () =>
      dialog
        .getByRole('button', { name: 'Create private copy', exact: true })
        .click()
    );
    await importPhase('confirm imported navigation', async () => {
      await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]+\/overview/);
      await expect(page.locator('.wiki-studio')).toContainText(
        'Synthetic imported hero'
      );
    });
    await importPhase('confirm imported privacy', async () => {
      const id = new URL(page.url()).pathname.split('/').at(-2);
      const published = await context.request.get(
        `${origin}/api/v1/lettin/worlds?worldId=${id}`,
        {
          timeout: 30_000,
          ...sessionOptions(`${origin}/api/v1/lettin/worlds?worldId=${id}`),
        }
      );
      expect(published.status()).toBe(200);
      expect(await published.json()).toEqual([]);
    });
  });
}
