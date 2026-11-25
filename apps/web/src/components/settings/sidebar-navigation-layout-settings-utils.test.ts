import { describe, expect, it } from 'vitest';
import type { NavigationItemDefinition } from './sidebar-navigation-layout-settings.types';
import { getConfigItems } from './sidebar-navigation-layout-settings-utils';

const item = (id: string): NavigationItemDefinition => ({
  defaultPlacement: 'more',
  icon: () => null,
  id,
  sectionLabel: id,
  title: id,
});

describe('getConfigItems', () => {
  const items = ['finance', 'tasks', 'mail', 'calendar', 'chat'].map(item);

  it('groups a saved order by category so each header appears once', () => {
    const result = getConfigItems(
      {
        hidden: [],
        more: ['finance', 'mail', 'tasks', 'chat', 'calendar'],
        root: [],
      },
      items,
      'more'
    );

    expect(result.map(({ id }) => id)).toEqual([
      'tasks',
      'calendar',
      'mail',
      'chat',
      'finance',
    ]);
  });

  it('leaves hidden items out', () => {
    expect(
      getConfigItems(
        { hidden: ['mail'], more: ['mail', 'tasks'], root: [] },
        items,
        'more'
      ).map(({ id }) => id)
    ).toEqual(['tasks']);
  });
});
