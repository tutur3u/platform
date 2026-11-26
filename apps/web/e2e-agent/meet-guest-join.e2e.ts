import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const MEET_GUEST_ROOM_PATH =
  process.env.E2E_MEET_ROOM_PATH?.trim() || '/en/r/e2e-guest-room';

test('joins a Meet room as a guest and waits in the lobby', async ({
  agent,
  app,
  screen,
}) => {
  await app.open(MEET_GUEST_ROOM_PATH);
  await expect(screen.getByRole('heading', 'Join meeting')).toBeVisible();

  await agent.act(
    'enter {displayName} as the guest display name and request to join the meeting',
    {
      params: {
        displayName: 'E2E Guest',
      },
    }
  );

  await expect(screen.getByRole('heading', 'Waiting in lobby')).toBeVisible();
  await expect(screen.getByRole('status')).toContainText(
    'Waiting for the host to admit you'
  );
  await expect(screen.getByTestId('meet-guest-badge')).toContainText(
    'E2E Guest'
  );
});
