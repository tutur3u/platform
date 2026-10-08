import { type APIRequestContext, expect } from '@playwright/test';
import sharp from 'sharp';
import type { LettinSessionRequestOptions } from './lettin-session';

export async function assertLettinProfileLimits(
  request: APIRequestContext,
  origin: string,
  username: string,
  sessionOptions: LettinSessionRequestOptions,
  onTicket: (ticket: { bucket: string; path: string }) => void
) {
  const profileApi = `${origin}/api/v1/users/me/profile`;
  for (const handle of ['four', 'google', 'apple', 'microsoft']) {
    expect(
      (
        await request.patch(profileApi, {
          data: { handle },
          ...sessionOptions(profileApi),
        })
      ).status()
    ).toBe(400);
  }
  expect(
    (
      await request.patch(profileApi, {
        data: { handle: `${username}_new` },
        ...sessionOptions(profileApi),
      })
    ).status()
  ).toBe(429);
  expect(
    (
      await request.patch(profileApi, {
        data: { display_name: 'Second synthetic name' },
        ...sessionOptions(profileApi),
      })
    ).status()
  ).toBe(200);
  const limited = await request.patch(profileApi, {
    data: {
      display_name: 'Rejected third name',
      bio: 'Rejected biography',
    },
    ...sessionOptions(profileApi),
  });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
  const unchanged = await request.get(profileApi, sessionOptions(profileApi));
  expect(await unchanged.json()).toMatchObject({
    display_name: 'Second synthetic name',
  });
  const secondTicket = await request.post(
    `${origin}/api/v1/users/me/avatar/upload-url`,
    {
      data: { filename: 'synthetic-avatar.png' },
      ...sessionOptions(`${origin}/api/v1/users/me/avatar/upload-url`),
    }
  );
  expect(secondTicket.status(), await secondTicket.text()).toBe(200);
  const avatarTicket = await secondTicket.json();
  onTicket({ bucket: 'avatars', path: avatarTicket.filePath as string });
  const source = await sharp({
    create: {
      width: 2048,
      height: 1024,
      channels: 4,
      background: { r: 20, g: 30, b: 40, alpha: 0.5 },
    },
  })
    .png()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const uploaded = await request.put(avatarTicket.uploadUrl, {
    headers: { 'Content-Type': 'image/png' },
    data: source,
  });
  expect(uploaded.status(), await uploaded.text()).toBe(200);
  const stored = await request.get(avatarTicket.publicUrl);
  expect(stored.status()).toBe(200);
  const optimized = await stored.body();
  expect(optimized.length).toBeLessThanOrEqual(1_000_000);
  const metadata = await sharp(optimized).metadata();
  expect(metadata.format).toBe('webp');
  expect(metadata.width).toBeLessThanOrEqual(1024);
  expect(metadata.height).toBeLessThanOrEqual(1024);
  expect(metadata.exif).toBeUndefined();
  const replay = await request.put(avatarTicket.uploadUrl, {
    headers: { 'Content-Type': 'image/png' },
    data: source,
  });
  expect(replay.status()).toBe(409);
  const deniedTicket = await request.post(
    `${origin}/api/v1/users/me/banner/upload-url`,
    {
      data: { filename: 'extra.png' },
      ...sessionOptions(`${origin}/api/v1/users/me/banner/upload-url`),
    }
  );
  expect(deniedTicket.status()).toBe(429);
  expect(Number(deniedTicket.headers()['retry-after'])).toBeGreaterThan(0);
}
