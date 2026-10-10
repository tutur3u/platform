import { expect, it } from 'vitest';
import { orderSavedLibrary } from './saved-library-ordering';

const items = [
  { id: 'new', savedAt: '2026-01-03T00:00:00Z', title: 'École' },
  { id: 'unknown', savedAt: 'invalid', title: null },
  { id: 'old', savedAt: '2026-01-01T00:00:00Z', title: 'Alpha' },
  { id: 'tie', savedAt: '2026-01-03T00:00:00Z', title: 'e\u0301cole' },
];
const ids = (order: 'newest' | 'oldest' | 'title') =>
  orderSavedLibrary(items, order, (item) => item.title).map((item) => item.id);

it('orders saved times in both directions with stable ties and invalid times last', () => {
  expect(ids('newest')).toEqual(['new', 'tie', 'old', 'unknown']);
  expect(ids('oldest')).toEqual(['old', 'new', 'tie', 'unknown']);
});

it('uses only normalized current titles with unavailable references last', () => {
  expect(ids('title')).toEqual(['old', 'new', 'tie', 'unknown']);
  expect(
    orderSavedLibrary(items, 'title', () => null).map((item) => item.id)
  ).toEqual(['new', 'unknown', 'old', 'tie']);
});

it('never mutates the source response and treats missing dates as unknown', () => {
  const source = Object.freeze([
    Object.freeze({ savedAt: '', title: 'First' }),
    Object.freeze({ savedAt: '2026-01-01T00:00:00Z', title: 'Second' }),
  ]);
  const result = orderSavedLibrary(source, 'newest', (item) => item.title);
  expect(result.map((item) => item.title)).toEqual(['Second', 'First']);
  expect(source.map((item) => item.title)).toEqual(['First', 'Second']);
  expect(result).not.toBe(source);
});
