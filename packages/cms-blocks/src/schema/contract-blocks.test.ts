import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CmsPageRenderer } from '../render';
import { CMS_EMBED_PROVIDERS, resolveCmsEmbed } from './embed';
import { allBlocks, contractPage } from './fixtures.test-utils';
import { toCmsPageVersionPayload } from './page-version';
import { cmsBlockSchema, cmsPageSchema } from './schema';

const embed = (url: string) => ({
  props: { aspect: '16:9', id: 'e', title: 'Video', url },
  type: 'Embed',
});

describe('ieeai contract blocks', () => {
  it('round-trips Section, Heading, Gallery, Embed, Accordion and Divider', () => {
    const parsed = cmsPageSchema.parse(
      JSON.parse(JSON.stringify(contractPage))
    );
    expect(parsed).toEqual(contractPage);
    expect(toCmsPageVersionPayload(parsed).schema_version).toBe(1);
  });

  it('keeps layouts out of Section children and validates anchors', () => {
    const section = contractPage.content.at(-1);
    const nested = {
      ...section,
      props: { ...section?.props, children: [allBlocks[8]] },
    };
    expect(cmsBlockSchema.safeParse(nested).success).toBe(false);
    const badAnchor = {
      ...section,
      props: { ...section?.props, anchor: 'Bad Anchor' },
    };
    expect(cmsBlockSchema.safeParse(badAnchor).success).toBe(false);
  });

  it('renders pages that use blocks the renderer does not support yet', () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(CmsPageRenderer, { page: contractPage })
      )
    ).not.toThrow();
  });
});

describe('embed allowlist', () => {
  it.each([
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://youtu.be/dQw4w9WgXcQ',
      'youtube',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://vimeo.com/76979871',
      'vimeo',
      'https://player.vimeo.com/video/76979871',
    ],
    [
      'https://www.google.com/maps/embed?pb=!1m18!2d106.7',
      'google-maps',
      'https://www.google.com/maps/embed?pb=!1m18!2d106.7',
    ],
  ])('resolves %s', (url, provider, src) => {
    expect(resolveCmsEmbed(url)).toEqual({ provider, src });
    expect(cmsBlockSchema.safeParse(embed(url)).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://evil.example/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=bad"id',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ\n',
    'https://www.youtube.com/watch?v=dQw4w9\u0000WgXcQ',
    ' https://youtu.be/dQw4w9WgXcQ',
    'https://vimeo.com/channels/staff',
    'https://www.google.com/maps/place/x',
  ])('rejects %j', (url) => {
    expect(resolveCmsEmbed(url)).toBeNull();
    expect(cmsBlockSchema.safeParse(embed(url)).success).toBe(false);
  });

  it('accepts an unset URL and lists every provider', () => {
    expect(cmsBlockSchema.safeParse(embed('')).success).toBe(true);
    expect(CMS_EMBED_PROVIDERS).toEqual(['youtube', 'vimeo', 'google-maps']);
  });
});
