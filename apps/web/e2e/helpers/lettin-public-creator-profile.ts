import { expect, type Page } from '@playwright/test';
import { z } from 'zod';
import { createLettinSessionRequestOptions } from './lettin-session';

/** The profile contract also runs alone, without earlier publishing tests. */
export async function verifyLettinPublicCreatorProfile(
  page: Page,
  fixture: {
    origin: string;
    workspaceId: string;
    session: string;
    username: string;
    creatorEmail: string;
  }
) {
  const { origin, workspaceId, session, username, creatorEmail } = fixture;
  const api = `${origin}/api/v1/workspaces/${workspaceId}/lettin`;
  const options = createLettinSessionRequestOptions(origin, session);
  const created = await page.request.post(api, {
    ...options(api),
    data: {
      action: 'createWorld',
      draft: {
        title: 'Synthetic profile notebook',
        kind: 'world',
        description: '',
        image: '',
        credit: '',
        tags: [],
        links: [],
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
    },
  });
  expect(created.status()).toBe(200);
  const world = z.object({ id: z.guid() }).parse(await created.json());
  const published = await page.request.post(api, {
    ...options(api),
    data: { action: 'publishWorld', worldId: world.id, version: 1 },
  });
  expect(published.status()).toBe(200);

  const publicUrl = `${origin}/creators/${username}`;
  const privateAbout = await page.goto(publicUrl);
  expect(privateAbout?.status()).toBe(200);
  await expect(
    page.getByText('Synthetic worldbuilder', { exact: true })
  ).toHaveCount(0);
  await expect(page.getByText(creatorEmail, { exact: true })).toHaveCount(0);

  await page.goto(`${origin}/${workspaceId}/profile`);
  await page.getByRole('button', { name: 'About you', exact: true }).click();
  const sharing = page.getByRole('checkbox');
  await expect(sharing).not.toBeChecked();
  await sharing.check();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'About you', exact: true }).click();
  await expect(sharing).toBeChecked();

  const publicAbout = await page.goto(publicUrl);
  expect(publicAbout?.status()).toBe(200);
  await expect(
    page.getByText('Synthetic worldbuilder', { exact: true })
  ).toBeVisible();
  await expect(page.getByText(creatorEmail, { exact: true })).toHaveCount(0);
}
