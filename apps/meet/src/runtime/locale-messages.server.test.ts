import { expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import {
  loadServerLocaleMessages,
  peekServerLocaleMessages,
} from './locale-messages.server';

it('loads only the requested locale and caches it for synchronous reads', async () => {
  expect(peekServerLocaleMessages('vi')).toBeUndefined();
  const first = loadServerLocaleMessages('vi');
  expect(loadServerLocaleMessages('vi')).toBe(first);
  expect(await first).toEqual(vi);
  expect(peekServerLocaleMessages('vi')).toBe(await first);
  expect(peekServerLocaleMessages('en')).toBeUndefined();
});

it('falls back to English for unknown locales', async () => {
  expect(await loadServerLocaleMessages('fr')).toEqual(en);
  expect(peekServerLocaleMessages('en')).toEqual(en);
});
