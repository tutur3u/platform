import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { createMoreToolsNavigation } from './navigation-more-tools';

const t = createTranslator({
  locale: 'en',
  messages: { personal_journal: { title: 'Personal journal' } },
  onError: () => {},
});
const input = {
  t,
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
