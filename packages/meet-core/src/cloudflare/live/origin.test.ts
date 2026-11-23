import { describe, expect, it } from 'vitest';
import { liveSocketOriginAllowed } from './origin';

const h = (origin: string | null | undefined) =>
  new Headers(origin ? { Origin: origin } : {});
const env = {
  NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
  PARLEY_APP_URL: 'https://parley.tuturuuu.com',
};

describe('liveSocketOriginAllowed', () => {
  it('accepts the legacy and shared origins for meet', () => {
    expect(
      liveSocketOriginAllowed(h('https://meet.tuturuuu.com'), 'meet', env)
    ).toBe(true);
    expect(
      liveSocketOriginAllowed(h('https://tuturuuu.com'), 'meet', env)
    ).toBe(true);
    expect(
      liveSocketOriginAllowed(h('https://tuturuuu.com'), undefined, env)
    ).toBe(true);
  });
  it('rejects foreign, lookalike, insecure and missing origins', () => {
    for (const bad of [
      'https://evil.example',
      'https://tuturuuu.com.evil.example',
      'http://tuturuuu.com',
      'null',
      '',
      null,
      undefined,
    ])
      expect(liveSocketOriginAllowed(h(bad), 'meet', env)).toBe(false);
  });
  it('keeps parley on its own origin only', () => {
    expect(
      liveSocketOriginAllowed(h('https://parley.tuturuuu.com'), 'parley', env)
    ).toBe(true);
    expect(
      liveSocketOriginAllowed(h('https://tuturuuu.com'), 'parley', env)
    ).toBe(false);
    expect(
      liveSocketOriginAllowed(h('https://meet.tuturuuu.com'), 'parley', env)
    ).toBe(false);
  });
});
