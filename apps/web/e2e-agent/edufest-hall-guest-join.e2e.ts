import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('joins the EduFest hall fixture as a guest and sees hall presence', async ({
  agent,
  app,
  screen,
}) => {
  const displayName = 'EduFest Guest';
  await app.open('/worlds');
  await expect(screen.getByRole('heading', 'EduFest hall')).toBeVisible();
  const hall = screen.getByRole('region', 'Hall floor plan');
  await expect(hall.getByText('Entrance')).toBeVisible();
  const self = hall.getByRole('img', 'You');
  await expect(self).toBeHidden();

  await agent.act('open the EduFest hall guest entry');
  await expect(screen.getByLabel('Display name')).toBeVisible();
  await expect(screen.getByRole('button', 'Join room')).toBeVisible();

  await agent.act('enter {displayName} and join the EduFest hall', {
    params: { displayName },
  });
  await expect(screen.getByRole('status')).toHaveText('In room');
  await expect(self).toBeVisible();
  await expect(self).toHaveText(displayName);
  await expect(screen.getByRole('button', 'Leave room')).toBeVisible();
});
