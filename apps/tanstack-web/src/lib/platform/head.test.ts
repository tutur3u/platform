import { describe, expect, it } from 'vitest';
import { createPageHead } from './head';

describe('createPageHead', () => {
  it('creates TanStack-compatible metadata and links', () => {
    const head = createPageHead(
      {
        canonicalUrl: 'https://tanstack.tuturuuu.localhost/vi/tasks',
        description: 'Task dashboard',
        imageUrl: 'https://static.tuturuuu.com/og.png',
        locale: 'vi',
        robots: 'noindex,nofollow',
        title: 'Tasks',
      },
      {
        alternates: {
          en: 'https://tanstack.tuturuuu.localhost/tasks',
          vi: 'https://tanstack.tuturuuu.localhost/vi/tasks',
        },
        stylesheets: ['/src/styles/app.css'],
      }
    );

    expect(head.meta).toContainEqual({ title: 'Tasks' });
    expect(head.meta).toContainEqual({
      content: 'Task dashboard',
      name: 'description',
    });
    expect(head.meta).toContainEqual({
      content: 'https://static.tuturuuu.com/og.png',
      property: 'og:image',
    });
    expect(head.links).toContainEqual({
      href: '/src/styles/app.css',
      rel: 'stylesheet',
    });
    expect(head.links).toContainEqual({
      href: 'https://tanstack.tuturuuu.localhost/vi/tasks',
      rel: 'canonical',
    });
    expect(head.links).toContainEqual({
      href: 'https://tanstack.tuturuuu.localhost/tasks',
      hrefLang: 'en',
      rel: 'alternate',
    });
  });

  it('allows route-specific Open Graph overrides', () => {
    const head = createPageHead(
      {
        description: 'Long page description',
        locale: 'vi',
        openGraphDescription: 'Short social description',
        openGraphLocale: 'vi_VN',
        title: 'Women in Tech',
      },
      {
        alternates: {
          'en-US': 'https://tuturuuu.com/en/women-in-tech',
          'vi-VN': 'https://tuturuuu.com/vi/women-in-tech',
        },
      }
    );

    expect(head.meta).toContainEqual({
      content: 'Long page description',
      name: 'description',
    });
    expect(head.meta).toContainEqual({
      content: 'Short social description',
      property: 'og:description',
    });
    expect(head.meta).toContainEqual({
      content: 'vi_VN',
      property: 'og:locale',
    });
    expect(head.links).toContainEqual({
      href: 'https://tuturuuu.com/en/women-in-tech',
      hrefLang: 'en-US',
      rel: 'alternate',
    });
  });
});
