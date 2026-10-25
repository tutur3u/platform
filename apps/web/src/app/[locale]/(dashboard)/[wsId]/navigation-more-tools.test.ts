import { createTranslator } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMoreToolsNavigation } from './navigation-more-tools';

const t = createTranslator({
  locale: 'en',
  messages: { personal_journal: { title: 'Personal journal' } },
  onError: () => {},
});
const input = {
  t,
  locale: 'en',
  canAccessPasswords: true,
  personalOrWsId: 'personal',
  resolvedWorkspaceId: 'workspace',
  ENABLE_AI_ONLY: false,
  hasSecret: () => false,
  withoutPermission: () => false,
  sidebarSections: {
    ai: 'AI',
    core: 'Core',
    operations: 'Operations',
    utilities: 'Utilities',
    workTools: 'Work',
  },
  isMailUser: false,
  isPersonal: true,
  chatAppHref: '/chat',
  contactsAppHref: '/contacts',
  hiveAppHref: '/hive',
  inventoryAppHref: '/inventory',
  mailAppHref: '/mail',
  meetAppHref: '/meet',
  mindAppHref: '/mind',
  qrAppHref: '/qr',
};
describe('more-tools journal navigation', () => {
  it('shows journal only in a personal workspace and keeps Notes independently navigable', () => {
    const personal = createMoreToolsNavigation(input);
    expect(
      personal.children?.find((item) => item?.id === 'personal_journal')
    ).toMatchObject({
      href: '/personal/personal-journal',
      disabled: false,
      aliases: ['/personal/personal-journal/*'],
    });
    const team = createMoreToolsNavigation({ ...input, isPersonal: false });
    expect(
      team.children?.find((item) => item?.id === 'personal_journal')
    ).toMatchObject({ disabled: true });
    expect(team.children?.find((item) => item?.id === 'notes')).toMatchObject({
      href: '/personal/notes',
    });
    expect(
      team.children?.filter((item) => item?.id !== 'personal_journal')
    ).toEqual(
      personal.children?.filter((item) => item?.id !== 'personal_journal')
    );
  });
});

afterEach(() => vi.unstubAllEnvs());
it('keeps Passwords disabled until activation and links the actual locale for members', () => {
  vi.stubEnv('PASSWORDS_APP_URL', '');
  const passwords = (overrides = {}) =>
    createMoreToolsNavigation({ ...input, ...overrides }).children?.find(
      (item) => item?.id === 'passwords'
    );
  expect(passwords()).toMatchObject({ disabled: true });
  vi.stubEnv('PASSWORDS_APP_URL', 'https://passwords.tuturuuu.com');
  expect(passwords({ locale: 'vi' })).toMatchObject({
    disabled: false,
    href: 'https://passwords.tuturuuu.com/vi/personal',
    external: true,
    aliases: ['/personal/passwords', '/personal/passwords/*'],
  });
  expect(passwords({ canAccessPasswords: false })).toMatchObject({
    disabled: true,
  });
});
