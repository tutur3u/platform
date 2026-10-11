import { expect, it, vi } from 'vitest';
import type { Store } from './context';
import {
  creatorAboutSchema,
  emptyCreatorAbout,
  readPublicCreatorAbout,
} from './creator-about';

function store(details: unknown) {
  return {
    prepare: () => ({
      bind: () => ({
        first: vi
          .fn()
          .mockResolvedValue(
            details === null ? null : { details: JSON.stringify(details) }
          ),
      }),
    }),
  } as unknown as Store;
}
it('defaults legacy details to private and never projects them publicly', async () => {
  const { shared: _shared, ...legacy } = emptyCreatorAbout;
  const details = {
    ...legacy,
    headline: 'Private headline',
    location: 'Private location',
  };
  expect(creatorAboutSchema.parse(details).shared).toBe(false);
  expect(await readPublicCreatorAbout(store(details), 'creator')).toBeNull();
  expect(await readPublicCreatorAbout(store(null), 'creator')).toBeNull();
});
it('allows sharing only with a boolean opt-in and hides it after revocation', async () => {
  const details = {
    ...emptyCreatorAbout,
    shared: true,
    headline: 'Shared headline',
  };
  expect(await readPublicCreatorAbout(store(details), 'creator')).toEqual(
    details
  );
  expect(
    await readPublicCreatorAbout(
      store({ ...details, shared: false }),
      'creator'
    )
  ).toBeNull();
  expect(
    creatorAboutSchema.safeParse({ ...details, shared: 'true' }).success
  ).toBe(false);
});
