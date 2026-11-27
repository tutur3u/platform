import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { openMobileApp } from './session.ts';

test('signed-out login accepts an email before submission', async ({
  app,
  agent,
  device,
  screen,
}) => {
  await openMobileApp({ app, device });
  await expect(screen.getByTestId('login-email')).toBeVisible();
  await agent.act(
    'Type qa@example.invalid into the email field without submitting the form'
  );
  await expect(screen.getByRole('textbox')).toHaveValue('qa@example.invalid');
});
