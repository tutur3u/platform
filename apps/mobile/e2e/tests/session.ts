import type { beforeEach } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import {
  mobileArtifactPath,
  mobileQaSession,
  mobileSessionCallback,
} from '../shared-mobile-config.ts';

type MobileFixtures = Parameters<Parameters<typeof beforeEach>[0]>[0];

export async function openMobileApp({
  app,
  device,
}: Pick<MobileFixtures, 'app' | 'device'>) {
  if (mobileArtifactPath(device.unstable_raw.platform)) {
    await device.installApp();
  }
  await app.open();
}

export async function openQaSession(
  fixtures: Pick<MobileFixtures, 'app' | 'device' | 'screen'>,
  session: NonNullable<ReturnType<typeof mobileQaSession>>
) {
  await openMobileApp(fixtures);
  const { device, screen } = fixtures;
  const shell = screen.getByTestId('shell-workspace-picker');
  const login = screen.getByTestId('login-email');
  await expect(login.or(shell)).toBeVisible();
  if (await login.isVisible()) {
    await device.openLink(mobileSessionCallback(session));
  }
  await expect(shell).toBeVisible();
}
