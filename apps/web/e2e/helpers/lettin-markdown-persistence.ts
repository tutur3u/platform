import { type BrowserContext, expect, test } from '@playwright/test';
import { safeLettinPhaseFailure } from './lettin-phase-diagnostics';

// Fixed phase names only: never log fixture IDs, response bodies, or credentials.
type Phase =
  | 'create Markdown page'
  | 'open wiki'
  | 'create project'
  | 'confirm project navigation'
  | 'open notebook'
  | 'edit Markdown'
  | 'save Markdown'
  | 'reload persisted Markdown';
async function phase<T>(name: Phase, action: () => Promise<T>): Promise<T> {
  console.info(`[lettin-e2e] ${name}: started`);
  try {
    const result = await test.step(name, action);
    console.info(`[lettin-e2e] ${name}: completed`);
    return result;
  } catch (error) {
    console.warn(`[lettin-e2e] ${name}: failed`, safeLettinPhaseFailure(error));
    throw error;
  }
}

export async function verifyLettinMarkdownPersistence(
  context: BrowserContext,
  origin: string,
  workspaceId: string
) {
  const page = await phase('create Markdown page', () => context.newPage());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await phase('open wiki', async () => {
    await page.goto(`${origin}/${workspaceId}/wiki`);
    await page
      .getByRole('button', { name: 'Start a project', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByLabel('Title', { exact: true })
      .fill('Synthetic browser notebook');
  });
  const project = await phase('create project', async () => {
    // Register the response waiter before the click, with its own finite deadline.
    const [created] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname ===
            `/api/v1/workspaces/${workspaceId}/lettin`,
        { timeout: 30_000 }
      ),
      page.getByRole('button', { name: 'Create project', exact: true }).click(),
    ]);
    expect(created.status(), await created.text()).toBe(200);
    const result = await created.json();
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    return result;
  });
  await phase('confirm project navigation', async () => {
    await expect(page).toHaveURL(new RegExp(`/worlds/${project.id}(?:[?]|$)`), {
      timeout: 30_000,
    });
  });
  await phase('open notebook', async () => {
    await page
      .getByRole('button', { name: 'World notebook', exact: true })
      .click({ timeout: 15_000 });
  });
  await phase('edit Markdown', async () => {
    await page
      .getByRole('button', { name: 'Markdown', exact: true })
      .click({ timeout: 15_000 });
    await page
      .getByLabel('Markdown source', { exact: true })
      .fill(
        '# Synthetic chapter\n\n**A memorable opening.**\n\n- First scene\n- Second scene',
        { timeout: 15_000 }
      );
    await expect(
      page.getByRole('button', { name: 'Save draft', exact: true })
    ).toBeDisabled();
  });
  await phase('save Markdown', async () => {
    await page
      .getByRole('button', { name: 'Apply Markdown', exact: true })
      .click({ timeout: 15_000 });
    await page
      .getByRole('button', { name: 'Save draft', exact: true })
      .click({ timeout: 15_000 });
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
  });
  await phase('reload persisted Markdown', async () => {
    await page.reload();
    await page
      .getByRole('button', { name: 'World notebook', exact: true })
      .click({ timeout: 15_000 });
    await expect(page.locator('.wiki-text-editor')).toContainText(
      'A memorable opening.'
    );
    await expect(page.locator('.wiki-text-editor strong')).toContainText(
      'A memorable opening.'
    );
    expect(errors).toEqual([]);
  });
}
