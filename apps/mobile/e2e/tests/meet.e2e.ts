import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { mobileQaSession } from '../shared-mobile-config.ts';
import { openQaSession } from './session.ts';

test('Meet opens from the Apps launcher', async ({
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
  await agent.act('Find the launcher tile app-launcher-meet and open Meet');
  await expect(screen.getByTestId('meet-new-meeting')).toBeVisible();
});
