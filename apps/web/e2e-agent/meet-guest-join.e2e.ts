import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const MEET_GUEST_ROOM_PATH =
  process.env.E2E_MEET_ROOM_PATH?.trim() || '/en/r/e2e-guest-room';

test('previews devices and enters a Meet room as a guest', async ({
  agent,
  app,
  screen,
}) => {
  const displayName = 'E2E Guest';
  await app.open(MEET_GUEST_ROOM_PATH);
  await expect(screen.getByRole('heading', 'Join meeting')).toBeVisible();
  await expect(screen.getByRole('region', 'Camera preview')).toBeVisible();

  const name = screen.getByRole('textbox', 'Display name');
  const askToJoin = screen.getByRole('button', 'Ask to join');
  await expect(name).toBeVisible();
  await expect(askToJoin).toBeDisabled();
  await expect(screen.getByRole('button', 'Turn camera on')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(screen.getByRole('button', 'Unmute microphone')).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await agent.act(
    'enter {displayName} and turn on the camera and microphone preview',
    {
      params: { displayName },
    }
  );
  await expect(name).toHaveValue(displayName);
  await expect(screen.getByRole('button', 'Turn camera off')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await expect(screen.getByRole('button', 'Mute microphone')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await expect(askToJoin).toBeEnabled();

  await agent.act('ask to join the meeting from the guest preview');
  await expect(screen.getByRole('status')).toHaveText('In meeting');
  const room = screen.getByRole('region', 'Meeting room');
  await expect(room.getByText(`${displayName} (you)`)).toBeVisible();
  await expect(room.getByRole('link', 'Leave call')).toBeVisible();
  await expect(name).toBeHidden();
});
