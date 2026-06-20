import { describe, expect, it } from 'vitest';
import legacyEnMessages from '../../../../web/messages/en.json';
import legacyViMessages from '../../../../web/messages/vi.json';
import {
  getAboutMessages,
  getCommonMessages,
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

  it('keeps localized route-shell copy aligned with the legacy common namespace', () => {
    expect(getCommonMessages('en')['404-msg']).toBe(
      legacyEnMessages.common['404-msg']
    );
    expect(getCommonMessages('vi')['back-to-home']).toBe(
      legacyViMessages.common['back-to-home']
    );
  });

  it('keeps migrated polls page messages aligned with the legacy web namespace', () => {
    expect(getMessages('en').sidebar_tabs.polls).toBe(
      legacyEnMessages.sidebar_tabs.polls
    );
    expect(getMessages('vi').sidebar_tabs.polls).toBe(
      legacyViMessages.sidebar_tabs.polls
    );
    expect(getMessages('en')['ws-polls']).toEqual(legacyEnMessages['ws-polls']);
    expect(getMessages('vi')['ws-polls']).toEqual(legacyViMessages['ws-polls']);
  });

  it('keeps migrated contact page messages aligned with the legacy web namespace', () => {
    expect(getMessages('en').contact).toMatchObject(legacyEnMessages.contact);
    expect(getMessages('vi').contact).toMatchObject(legacyViMessages.contact);
    expect(getMessages('en').contact.form.status.success.title).toBe(
      'Message sent'
    );
    expect(getMessages('vi').contact.form.validation.email).toBe(
      'Vui lòng nhập email hợp lệ'
    );
  });
});
