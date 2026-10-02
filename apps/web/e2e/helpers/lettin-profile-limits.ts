import { type APIRequestContext, expect } from '@playwright/test';

export async function assertLettinProfileLimits(
  request: APIRequestContext,
  origin: string,
  username: string,
  onTicket: (ticket: { bucket: string; path: string }) => void
) {
  const profileApi = `${origin}/api/v1/users/me/profile`;
  for (const handle of ['four', 'google', 'apple', 'microsoft']) {
    expect(
      (await request.patch(profileApi, { data: { handle } })).status()
    ).toBe(400);
  }
  expect(
    (
      await request.patch(profileApi, {
        data: { handle: `${username}_new` },
      })
    ).status()
  ).toBe(429);
  expect(
    (
      await request.patch(profileApi, {
        data: { display_name: 'Second synthetic name' },
      })
    ).status()
  ).toBe(200);
  const limited = await request.patch(profileApi, {
    data: {
      display_name: 'Rejected third name',
      bio: 'Rejected biography',
    },
  });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
  const unchanged = await request.get(profileApi);
  expect(await unchanged.json()).toMatchObject({
    display_name: 'Second synthetic name',
  });
  const secondTicket = await request.post(
    `${origin}/api/v1/users/me/avatar/upload-url`,
    { data: { filename: 'synthetic-avatar.png' } }
  );
  expect(secondTicket.status(), await secondTicket.text()).toBe(200);
  const avatarTicket = await secondTicket.json();
  onTicket({ bucket: 'avatars', path: avatarTicket.filePath as string });
  const oversized = await request.put(avatarTicket.uploadUrl, {
    headers: { 'Content-Type': 'image/png' },
    data: Buffer.alloc(2 * 1024 ** 2 + 1),
  });
  expect([400, 413]).toContain(oversized.status());
  expect(await oversized.text()).toMatch(/size|too large|maximum/i);
  const deniedTicket = await request.post(
    `${origin}/api/v1/users/me/banner/upload-url`,
    { data: { filename: 'extra.png' } }
  );
  expect(deniedTicket.status()).toBe(429);
  expect(Number(deniedTicket.headers()['retry-after'])).toBeGreaterThan(0);
}
