import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { mobileQaSession } from '../shared-mobile-config.ts';
import { openQaSession } from './session.ts';

test('Contacts searches the directory and opens a contact and Reports', async ({
  app,
  agent,
  device,
  screen,
}) => {
  const session = mobileQaSession();
  if (!session) {
    test.skip('Supply a disposable QA session for signed-in specs.');
    return;
  }

  await openQaSession({ app, device, screen }, session);
  await screen.getByTestId('shell-nav-apps').click();
  await agent.act('Open Contacts from the Apps launcher');
  const row = screen.getByTestId(/^mobile\.contacts\.row\./u).first();
  await expect(row).toBeVisible();

  await agent.act('Open the Contacts directory search');
  await screen.getByRole('textbox').fill('tuturuuu-e2e-no-match');
  const empty = screen.getByTestId('mobile.contacts.search-empty');
  await expect(empty).toBeVisible();
  await expect(row).toBeHidden();
  await agent.act('Close the directory search and clear the search query');
  await expect(row).toBeVisible();

  await agent.act('Open Filters for the Contacts directory');
  await expect(screen.getByTestId('mobile.contacts.filters')).toBeVisible();
  await agent.act('Dismiss the Contacts filter sheet without applying changes');

  await row.click();
  await expect(screen.getByTestId('mobile.contacts.detail')).toBeVisible();
  await agent.act('Use Back in the Contacts dock to return to the directory');
  await expect(row).toBeVisible();
  await agent.act('Open More tools in Contacts, then Sections, then Reports');
  await expect(screen.getByTestId('mobile.contacts.reports')).toBeVisible();
});
