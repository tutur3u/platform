// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { describeClick, redactRoute } from './ended-navigation-breadcrumb';

const origin = 'https://meet.test';

it('reduces routes to a pattern without ids, query or hash', () => {
  expect(redactRoute('/r/abcd-efgh-ijkl?notes=1#x', origin)).toBe('/r/:code');
  expect(
    redactRoute(
      '/personal/meetings/5e5217de-9bb3-4e20-8d99-526ad3e7e34f?name=Ann',
      origin
    )
  ).toBe('/personal/meetings/:id');
  expect(
    redactRoute(
      '/api/meet-call/5e5217de-9bb3-4e20-8d99-526ad3e7e34f/recording?sessionId=1&download=1',
      origin
    )
  ).toBe('/api/meet-call/:id/recording');
});

it('keeps only the origin of a cross-origin target', () => {
  expect(redactRoute('https://files.example/x/y?sig=secret', origin)).toBe(
    'https://files.example'
  );
  expect(redactRoute('about:blank', origin)).toBe('about:blank');
  expect(redactRoute('blob:https://meet.test/abc-secret', origin)).toBe(
    'blob:'
  );
});

it('describes the clicked control without its text', () => {
  document.body.innerHTML =
    '<a id="a" href="/api/meet-call/5e5217de-9bb3-4e20-8d99-526ad3e7e34f/recording?download=1" download target="_blank"><span id="s">Private title</span></a>';
  const click = describeClick(document.getElementById('s'), origin);
  expect(click).toEqual({
    tag: 'a',
    download: true,
    target: '_blank',
    href: '/api/meet-call/:id/recording',
  });
  expect(describeClick(document.body, origin)).toBeNull();
});
