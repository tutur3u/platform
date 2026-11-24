import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readMeetingHostName } from './host-name';

function admin(result: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            result instanceof Error
              ? Promise.reject(result)
              : Promise.resolve(result),
        }),
      }),
    }),
  } as never;
}

it('prefers the saved profile name', async () => {
  expect(
    await readMeetingHostName(
      admin({ data: { display_name: ' Minh Anh ' } }),
      'a',
      { display_name: 'Other' }
    )
  ).toBe('Minh Anh');
});

it('falls back to the account metadata, then to nothing', async () => {
  expect(
    await readMeetingHostName(admin({ data: null }), 'a', {
      full_name: 'Gia Huy',
    })
  ).toBe('Gia Huy');
  expect(await readMeetingHostName(admin({ data: null }), 'a', null)).toBe('');
});

it('does not fail the page when the profile lookup rejects', async () => {
  expect(
    await readMeetingHostName(admin(new Error('offline')), 'a', {
      display_name: 'Thu Trang',
    })
  ).toBe('Thu Trang');
});

it('caps a very long name', async () => {
  expect(
    (
      await readMeetingHostName(
        admin({ data: { display_name: 'x'.repeat(200) } }),
        'a'
      )
    ).length
  ).toBe(80);
});

it('cuts by grapheme so an emoji at the limit is not split', async () => {
  const name = `${'a'.repeat(79)}👩‍👩‍👧‍👦tail`;
  expect(
    await readMeetingHostName(admin({ data: { display_name: name } }), 'a')
  ).toBe(`${'a'.repeat(79)}👩‍👩‍👧‍👦`);
});

it('composes a decomposed Vietnamese name and strips hidden characters', async () => {
  const decomposed = 'Tra\u0302\u0300n\u200B Minh'.normalize('NFD');
  expect(
    await readMeetingHostName(
      admin({ data: { display_name: decomposed } }),
      'a'
    )
  ).toBe('Tra\u0302\u0300n Minh'.normalize('NFC'));
});

it('falls through to the account names when the saved name is invisible', async () => {
  expect(
    await readMeetingHostName(
      admin({ data: { display_name: String.fromCodePoint(0x3164, 0x200b) } }),
      'a',
      { full_name: 'Gia Huy' }
    )
  ).toBe('Gia Huy');
});

it('keeps a default title under the API limit even for a long emoji name', async () => {
  const name = '👩\u200D👩\u200D👧\u200D👦'.repeat(80);
  const result = await readMeetingHostName(
    admin({ data: { display_name: name } }),
    'a'
  );
  expect(result.length).toBeLessThanOrEqual(200);
  expect(`${result}'s meeting`.length).toBeLessThanOrEqual(255);
});
