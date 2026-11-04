import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cmsPageSchema } from '../schema';
import { RenderPage } from './index';
import { safeHref, safeImage } from './rich-text';

describe('public rendering', () => {
  it('renders nested content and escapes text without executing HTML', () => {
    const page = cmsPageSchema.parse({ schemaVersion: 1, root: { props: {} }, content: [
      { type: 'TwoColumn', props: { id: 'columns', ratio: '1:2', left: [
        { type: 'Hero', props: { id: 'hero', title: '<script>bad()</script>', subtitle: 'First site', imageUrl: '', ctaHref: '/visit', ctaLabel: 'Visit' } },
      ], right: [{ type: 'RichText', props: { id: 'text', doc: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:bad()' } }] }] },
      ] } } }] } },
    ] });
    const html = renderToStaticMarkup(<RenderPage page={page} />);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>Hello</strong>');
    expect(html).toContain('href="/visit"');
    expect(html).toContain('grid-template-columns:1fr 2fr');
    expect(html).not.toContain('javascript:');
  });

  it.each(['javascript:alert(1)', 'data:text/html,bad', '//outside.test', '/\\outside.test', '\nhttps://outside.test'])('rejects unsafe URL %s', (url) => {
    expect(safeHref(url)).toBeUndefined();
    expect(safeImage(url)).toBeUndefined();
  });

  it('allows ordinary site links and limits image schemes', () => {
    expect(safeHref('/about')).toBe('/about');
    expect(safeHref('https://example.invalid/a')).toBe('https://example.invalid/a');
    expect(safeHref('mailto:hello@example.invalid')).toBeDefined();
    expect(safeImage('mailto:hello@example.invalid')).toBeUndefined();
  });
});
