import { expect, it, vi } from 'vitest';
import { createProfileMediaUploadTicket } from './profile-media';

it('uses the authenticated JSON client without accepting an actor override', async () => {
  const ticket = {
    uploadUrl: 'https://upload.test',
    publicUrl: 'https://public.test',
    filePath: 'actor/banner.jpg',
    token: 'synthetic',
  };
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(ticket), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  expect(
    await createProfileMediaUploadTicket('banner', 'photo.jpg', {
      baseUrl: 'https://platform.test',
      fetch,
    })
  ).toEqual(ticket);
  const [url, init] = fetch.mock.calls[0]!;
  expect(String(url)).toBe(
    'https://platform.test/api/v1/users/me/banner/upload-url'
  );
  expect(init.credentials).toBe('include');
  expect(new Headers(init.headers).get('Content-Type')).toBe(
    'application/json'
  );
  expect(JSON.parse(init.body)).toEqual({ filename: 'photo.jpg' });
});
