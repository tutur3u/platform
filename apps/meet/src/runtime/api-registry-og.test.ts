import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

const landingGet = vi.hoisted(() =>
  vi.fn(() => new Response('card', { headers: { 'Content-Type': 'image/png' } }))
);

vi.mock('../app/og/route', () => ({ GET: landingGet }));

import { dispatchMeetEndpoint } from './api-registry';

it.each([
  '/og',
  '/en/og',
  '/vi/og',
])('serves the landing link-preview card at %s', async (path) => {
  landingGet.mockClear();
  const response = await dispatchMeetEndpoint(
    new NextRequest(`https://meet.test${path}?lang=en`)
  );
  expect(response?.status).toBe(200);
  expect(response?.headers.get('Content-Type')).toBe('image/png');
  expect(landingGet).toHaveBeenCalledTimes(1);
});
