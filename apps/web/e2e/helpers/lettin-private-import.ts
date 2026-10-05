import { type BrowserContext, expect } from '@playwright/test';
import { withLettinContextCleanup } from './lettin-context-cleanup';
import { safeLettinPhaseFailure } from './lettin-phase-diagnostics';

type ImportPhase =
  | 'create import page'
  | 'open import wiki'
  | 'open import dialog'
  | 'configure import file'
  | 'upload canonical export'
  | 'review canonical export'
  | 'apply private import';
async function importPhase<T>(name: ImportPhase, action: () => Promise<T>) {
  console.info(`[lettin-e2e] ${name}: started`);
  try {
    const result = await action();
    console.info(`[lettin-e2e] ${name}: completed`);
    return result;
  } catch (error) {
    console.warn(`[lettin-e2e] ${name}: failed`, safeLettinPhaseFailure(error));
    throw error;
  }
}

export async function verifyLettinPrivateImport(
  context: BrowserContext,
  origin: string,
  workspaceId: string
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
    await importPhase('review canonical export', () =>
      dialog.getByRole('button', { name: 'Review import', exact: true }).click()
    );
    await expect(
      dialog.getByText('Synthetic imported hero', { exact: true })
    ).toBeVisible();
    await importPhase('apply private import', () =>
      dialog
        .getByRole('button', { name: 'Create private copy', exact: true })
        .click()
    );
    await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]+\/overview/);
    await expect(page.locator('.wiki-studio')).toContainText(
      'Synthetic imported hero'
    );
    const id = new URL(page.url()).pathname.split('/').at(-2);
    const published = await context.request.get(
      `${origin}/api/v1/lettin/worlds?worldId=${id}`,
      { timeout: 30_000 }
    );
    expect(await published.json()).toEqual([]);
  });
}
