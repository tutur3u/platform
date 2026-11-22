// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useRoomDraft } from './room-draft';

it('follows what the room stored until the person edits, then keeps their text', () => {
  const { result, rerender } = renderHook(
    ({ stored }) => useRoomDraft(stored),
    { initialProps: { stored: '' } }
  );
  // Their saved answer arrives after the first render.
  rerender({ stored: 'Saved answer' });
  expect(result.current[0]).toBe('Saved answer');
  act(() => result.current[1]('Typed since'));
  // A repeat of the stored value, or a newer one, never replaces typed text.
  rerender({ stored: 'Saved answer' });
  rerender({ stored: 'From another device' });
  expect(result.current[0]).toBe('Typed since');
  // Once the room holds what they typed, the draft follows the room again.
  rerender({ stored: 'Typed since' });
  rerender({ stored: '' });
  expect(result.current[0]).toBe('');
});

it('compares structured drafts by their words, not by identity', () => {
  type Card = { key: string; front: string };
  const same = (a: Card[], b: Card[]) =>
    a.map(({ front }) => front).join() === b.map(({ front }) => front).join();
  const { result, rerender } = renderHook(
    ({ stored }) => useRoomDraft(stored, same),
    { initialProps: { stored: [{ key: 'a', front: 'One' }] } }
  );
  const first = result.current[0];
  // The room repeats the same deck under new ids: nothing to adopt.
  rerender({ stored: [{ key: 'b', front: 'One' }] });
  expect(result.current[0]).toBe(first);
  // Someone else saved a different deck, and this draft is untouched.
  rerender({ stored: [{ key: 'c', front: 'Two' }] });
  expect(result.current[0]).toEqual([{ key: 'c', front: 'Two' }]);
  act(() => result.current[1]([{ key: 'c', front: 'Two, edited' }]));
  rerender({ stored: [{ key: 'd', front: 'Three' }] });
  expect(result.current[0]).toEqual([{ key: 'c', front: 'Two, edited' }]);
});
