import { describe, expect, it } from 'vitest';
import legacyEnMessages from '../../../../web/messages/en.json';
import legacyViMessages from '../../../../web/messages/vi.json';
import {
  getAboutMessages,
  getMessages,
  resolveMessagesLocale,
} from './messages';

describe('message adapters', () => {
  it('resolves unsupported locales to the default message bundle', () => {
    expect(resolveMessagesLocale('fr')).toBe('en');
    expect(getMessages('fr').about.hero.title.part1).toBe('Unlocking');
  });

  it('serves the migrated about namespace in both supported locales', () => {
    expect(getAboutMessages('en').hero.title.highlight).toBe('Human Potential');
    expect(getAboutMessages('vi').hero.title.highlight).toBe(
      'Tiềm Năng Con Người'
    );
    expect(getAboutMessages('vi').cta.getInTouch).toBe('Liên Hệ');
  });

  it('keeps migrated about messages aligned with the legacy web namespace', () => {
    expect(getAboutMessages('en')).toEqual(legacyEnMessages.about);
    expect(getAboutMessages('vi')).toEqual(legacyViMessages.about);
  });
});
