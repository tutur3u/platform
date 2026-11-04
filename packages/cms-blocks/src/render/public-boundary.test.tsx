import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CmsPageRenderer, safeUrl } from './render';

describe('public renderer security boundary', () => {
  it.each([
    '/\\evil.com',
    '/path\\evil.com',
    '\\evil.com',
    '//evil.com',
    '/line\nbreak',
    '/tab\tpath',
    '/nul\u0000path',
    '/del\u007fpath',
    '/c1\u0085path',
  ])('rejects browser-ambiguous or control-containing URL %j', (url) => {
    expect(safeUrl(url)).toBeUndefined();
  });

  it('preserves ordinary internal and external links', () => {
    for (const url of [
      '/about',
      '#about',
      'https://first.invalid/about',
      'mailto:hello@first.invalid',
      'tel:123',
    ]) {
      expect(safeUrl(url)).toBe(url);
    }
  });

  it.each([
    null,
    undefined,
    {},
    { schemaVersion: 2, root: { props: {} }, content: [] },
    {
      schemaVersion: 1,
      root: { props: {} },
      content: [{ type: 'UnknownBlock', props: { id: 'unknown' } }],
    },
    {
      schemaVersion: 1,
      root: { props: {} },
      content: [{ type: 'Heading', props: { id: 'invalid', level: '9' } }],
    },
  ])('renders no HTML for invalid page input %j', (page) => {
    expect(renderToStaticMarkup(<CmsPageRenderer page={page} />)).toBe('');
  });

  it('still renders a validated page', () => {
    const page = {
      schemaVersion: 1,
      root: { props: {} },
      content: [
        {
          type: 'Heading',
          props: {
            id: 'valid',
            anchor: '',
            align: 'left',
            level: '2',
            text: 'First site',
          },
        },
      ],
    };
    expect(renderToStaticMarkup(<CmsPageRenderer page={page} />)).toContain(
      'First site</h2>'
    );
  });
});
