import { describe, expect, it } from 'vitest';
import { teachNavigationItems } from './teach-navigation-items';

describe('Teach command navigation', () => {
  it('indexes active nested shortcuts once and retains aliases', () => {
    expect(
      teachNavigationItems([
        {
          title: 'Courses',
          href: '/w/courses',
          children: [
            { title: 'Courses again', href: '/w/courses' },
            { title: 'Builder', href: '/w/builder', aliases: ['/w/modules'] },
            { title: 'Disabled', href: '/w/disabled', disabled: true },
          ],
        },
      ])
    ).toMatchObject([
      { title: 'Courses', href: '/w/courses' },
      {
        title: 'Builder',
        href: '/w/builder',
        aliases: ['/w/modules'],
        group: 'Courses',
      },
    ]);
  });
});
