import { expect, it } from 'vitest';
import { SubscriptionClosures } from './subscription-closures';

it('discards a pending response after close while allowing a later retry', async () => {
  const closures = new SubscriptionClosures();
  const isOpen = closures.capture(['publisher:audio', 'publisher:video']);
  let resolve!: (keys: string[]) => void;
  const response = new Promise<string[]>((done) => {
    resolve = done;
  });
  const applied = response.then((keys) => keys.filter(isOpen));
  closures.close(['publisher:audio']);
  const retryIsOpen = closures.capture(['publisher:audio']);
  resolve(['publisher:audio', 'publisher:video']);
  expect(await applied).toEqual(['publisher:video']);
  expect(isOpen('publisher:audio')).toBe(false);
  expect(retryIsOpen('publisher:audio')).toBe(true);
  expect(isOpen('unrequested')).toBe(false);
});
