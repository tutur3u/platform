import { expect } from '@playwright/test';
import en from '../../meet/messages/en.json';
import vi from '../../meet/messages/vi.json';
import { input, readJson, signIn, test } from './fixtures';

test('signed-in lobby, local camera/microphone and network recovery', async ({
  page,
  context,
  acceptanceLocale,
}) => {
  const copy = (acceptanceLocale === 'vi' ? vi : en).meet.call;
  await signIn(
    page,
    acceptanceLocale,
    `/r/${encodeURIComponent(input('MEET_ROOM_CODE'))}`
  );
  await expect(
    page.getByRole('heading', { name: input('MEET_ROOM_TITLE'), exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: copy.camera_on, exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluateAll((videos) =>
          videos.some(
            (video) =>
              video instanceof HTMLVideoElement &&
              video.readyState >= 2 &&
              video.videoWidth > 0
          )
        )
    )
    .toBe(true);
  const previewTracks = await page
    .locator('video')
    .first()
    .evaluateHandle((video) => {
      if (
        !(video instanceof HTMLVideoElement) ||
        !(video.srcObject instanceof MediaStream)
      )
        throw new Error('Lobby preview stream missing');
      return video.srcObject.getTracks();
    });
  const microphone = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const live = stream
      .getAudioTracks()
      .some((track) => track.readyState === 'live');
    for (const track of stream.getTracks()) track.stop();
    return live;
  });
  expect(microphone).toBe(true);
  await page.getByRole('button', { name: copy.mute, exact: true }).click();
  await expect(
    page.getByRole('button', { name: copy.unmute, exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: copy.camera_off, exact: true })
    .click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect
    .poll(() =>
      previewTracks.evaluate((tracks) =>
        tracks.every((track) => track.readyState === 'ended')
      )
    )
    .toBe(true);
  await previewTracks.dispose();
  await context.setOffline(true);
  try {
    expect(
      await page.evaluate(() =>
        fetch('/.well-known/meeting-runtime').then(
          () => false,
          () => true
        )
      )
    ).toBe(true);
  } finally {
    await context.setOffline(false);
  }
  expect(await readJson(page, '/.well-known/meeting-runtime')).toEqual({
    version: 1,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: input('MEET_ROOM_TITLE'), exact: true })
  ).toBeVisible();
});
