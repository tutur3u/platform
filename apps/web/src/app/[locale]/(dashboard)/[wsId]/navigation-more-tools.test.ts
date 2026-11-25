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

describe('more-tools entries', () => {
  const children = createMoreToolsNavigation(input).children ?? [];
  const find = (id: string) => children.find((item) => item?.id === id);
  const iconName = (id: string) =>
    (find(id)?.icon as { name?: string } | undefined)?.name;

  it('shows Documents to anyone with the permission, with no feature secret', () => {
    expect(find('documents')).toMatchObject({
      disabled: false,
      href: '/personal/documents',
    });
    expect(
      createMoreToolsNavigation({
        ...input,
        withoutPermission: (permission: string) =>
          permission === 'manage_documents',
      }).children?.find((item) => item?.id === 'documents')
    ).toMatchObject({ disabled: true });
  });

  it('gives each top-level app its own icon', () => {
    const names = children
      .filter((item) => item?.id && item.id !== 'google_workspace')
      .map((item) => iconName(item!.id!));

    expect(iconName('personal_journal')).not.toBe(iconName('notes'));
    expect(iconName('posts')).not.toBe('ClipboardList');
    expect(new Set(names).size).toBe(names.length);
  });
});
