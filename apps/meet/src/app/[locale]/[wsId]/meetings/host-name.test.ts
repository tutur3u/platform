import { expect, it } from 'vitest';
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
