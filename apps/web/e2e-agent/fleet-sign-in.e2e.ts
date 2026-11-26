import { test } from '@e2e-dev/web';
import { credentials, expect, secrets } from 'e2e';

test('signs in with the fleet test identity from env names only', async ({
  agent,
  app,
  browser,
  screen,
}) => {
  const fleet = credentials.user('fleet');

  await app.open('/en/login');
  await expect(
    screen.getByPlaceholder('Enter your email or username')
  ).toBeVisible();

  await agent.act(
    'enter the fleet email and continue to the password step, then submit the fleet password to sign in',
    {
      params: {
        email: secrets.get('fleet-email'),
        password: fleet.password,
      },
    }
  );

  await expect(browser).toHaveURL(/\/en\/personal(?:\/|$)/);
  await expect(screen.getByRole('heading', 'Personal Workspace')).toBeVisible();
});
