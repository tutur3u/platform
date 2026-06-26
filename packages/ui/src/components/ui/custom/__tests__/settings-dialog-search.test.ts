import { describe, expect, it } from 'vitest';
import { createSettingsSearchEngine } from '../settings-dialog-search';
import type { SettingsNavGroup } from '../settings-dialog-shell';

function TestIcon() {
  return null;
}

const navItems: SettingsNavGroup[] = [
  {
    label: 'Workspace',
    items: [
      {
        aliases: ['organization'],
        description: 'Manage workspace profile and branding',
        icon: TestIcon,
        keywords: ['general'],
        label: 'General',
        name: 'workspace_general',
      },
      {
        description: 'Invite people and manage roles',
        icon: TestIcon,
        keywords: ['team'],
        label: 'Members',
        name: 'workspace_members',
      },
    ],
  },
  {
    label: 'Developer',
    items: [
      {
        description: 'Secret keys for external apps',
        icon: TestIcon,
        label: 'API Keys',
        name: 'api_keys',
        searchLabels: ['sdk tokens'],
      },
      {
        disabled: true,
        icon: TestIcon,
        label: 'Secrets',
        name: 'secrets',
      },
    ],
  },
];

describe('createSettingsSearchEngine', () => {
  it('matches labels, group labels, descriptions, aliases, and keywords', () => {
    const engine = createSettingsSearchEngine(navItems);

    expect(engine.search('members')[0]?.items.map((item) => item.name)).toEqual(
      ['workspace_members']
    );
    expect(
      engine.search('organization')[0]?.items.map((item) => item.name)
    ).toEqual(['workspace_general']);
    expect(engine.search('sdk')[0]?.items.map((item) => item.name)).toEqual([
      'api_keys',
    ]);
    expect(
      engine.search('developer')[0]?.items.map((item) => item.name)
    ).toEqual(['api_keys', 'secrets']);
  });

  it('normalizes accents and excludes disabled items from enabled traversal', () => {
    const engine = createSettingsSearchEngine(navItems);

    expect(engine.search('generál')[0]?.items.map((item) => item.name)).toEqual(
      ['workspace_general']
    );
    expect(
      engine.getEnabledItems('developer').map((item) => item.name)
    ).toEqual(['api_keys']);
  });
});
