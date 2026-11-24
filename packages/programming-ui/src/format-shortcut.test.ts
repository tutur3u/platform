import { expect, it } from 'vitest';
import { isFormatShortcut } from './format-shortcut';

const press = (over: Partial<Parameters<typeof isFormatShortcut>[0]> = {}) => ({
  code: 'KeyF',
  metaKey: false,
  ctrlKey: false,
  altKey: true,
  shiftKey: true,
  ...over,
});

it('matches Shift+Alt+F on the physical key, whatever character it types', () => {
  expect(isFormatShortcut(press())).toBe(true);
  // Option+Shift+F types a different character on Apple keyboards.
  expect(isFormatShortcut({ ...press(), code: 'KeyF' })).toBe(true);
});

it('ignores other chords and composition', () => {
  expect(isFormatShortcut(press({ shiftKey: false }))).toBe(false);
  expect(isFormatShortcut(press({ altKey: false }))).toBe(false);
  expect(isFormatShortcut(press({ ctrlKey: true }))).toBe(false);
  expect(isFormatShortcut(press({ metaKey: true }))).toBe(false);
  expect(isFormatShortcut(press({ code: 'KeyG' }))).toBe(false);
  expect(isFormatShortcut(press({ isComposing: true }))).toBe(false);
});
