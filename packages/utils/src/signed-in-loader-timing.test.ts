import { describe, expect, it, vi } from 'vitest';
import { signedInLoaderTiming } from './signed-in-loader-timing';

const url = 'https://tuturuuu.com/calendar/personal';
const qaDocumentHeaders = {
  'sec-fetch-dest': 'document',
  'x-tuturuuu-qa-timing': '1',
};

describe('signed-in loader timing', () => {
  it('emits closed labels for one opted-in response bag and preserves entries', async () => {
    const headers = new Headers({ 'server-timing': 'edge;dur=1' });
    const request = new Request(url, { headers: qaDocumentHeaders });
    const proxy = signedInLoaderTiming(request, headers);
    await proxy.measure('proxy', async () => 200);

    const loader = signedInLoaderTiming(new Request(request), headers);
    await Promise.all([
      loader.measure('workspace', async () => 'workspace'),
      loader.measure('profile', async () => 'profile'),
    ]);
    expect(headers.get('server-timing')).toBe('edge;dur=1');
    await loader.appendToResponse(async () => false);
    expect(headers.get('server-timing')).toBe('edge;dur=1');
    await loader.appendToResponse(async () => true);

    expect(headers.get('server-timing')).toMatch(
      /^edge;dur=1, proxy;dur=\d+(?:\.\d+)?, workspace;dur=\d+(?:\.\d+)?, profile;dur=\d+(?:\.\d+)?$/u
    );
    const another = new Headers();
    await signedInLoaderTiming(request, another).appendToResponse(
      async () => true
    );
    expect(another.has('server-timing')).toBe(false);
  });

  it.each<RequestInit>([
    { method: 'POST', headers: qaDocumentHeaders },
    { headers: { 'sec-fetch-dest': 'document' } },
    { headers: { 'x-tuturuuu-qa-timing': '1', 'sec-fetch-dest': 'empty' } },
  ])('records no timing outside an opted-in document GET', async (init) => {
    const headers = new Headers();
    const timing = signedInLoaderTiming(new Request(url, init), headers);
    expect(await timing.measure('actor', async () => 42)).toBe(42);
    const authorize = vi.fn().mockResolvedValue(true);
    await timing.appendToResponse(authorize);
    expect(authorize).not.toHaveBeenCalled();
    expect(headers.has('server-timing')).toBe(false);
  });
});
