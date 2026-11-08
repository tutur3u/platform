import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cmsPageSchema } from '../schema';
import { CmsPageRenderer, Embed, Gallery } from './render';

const leaves = [
  {
    type: 'Heading',
    props: {
      id: 'heading',
      level: '2',
      text: 'First site',
      align: 'center',
      anchor: 'first-site',
    },
  },
  {
    type: 'Gallery',
    props: {
      id: 'gallery',
      columns: '2',
      aspect: 'square',
      images: [
        {
          src: '/s.png',
          alt: 'Image',
          caption: 'Caption',
        },
      ],
    },
  },
  {
    type: 'Embed',
    props: {
      id: 'embed',
      aspect: '16:9',
      title: 'Synthetic video',
      url: 'https://youtu.be/abcdefghijk',
    },
  },
  {
    type: 'Accordion',
    props: {
      id: 'accordion',
      heading: 'Questions',
      items: [
        {
          question: 'Synthetic question',
          answer: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: '<script>x</script>',
                    marks: [{ type: 'bold' }],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  },
  {
    type: 'Divider',
    props: { id: 'divider', spacing: 'lg', variant: 'dashed' },
  },
];

describe('schema-backed public renderers', () => {
  it('renders all six types through the public page codec, including Section children', () => {
    const page = cmsPageSchema.parse({
      schemaVersion: 1,
      root: { props: {} },
      content: [
        ...leaves,
        {
          type: 'Section',
          props: {
            id: 'section',
            anchor: 'section',
            width: 'wide',
            background: 'muted',
            padding: 'lg',
            children: leaves,
          },
        },
      ],
    });
    const html = renderToStaticMarkup(<CmsPageRenderer page={page} />);
    for (const type of [
      'Section',
      'Heading',
      'Gallery',
      'Embed',
      'Accordion',
      'Divider',
    ]) {
      expect(html).toContain(`data-block="${type}"`);
    }
    expect(page.schemaVersion).toBe(1);
    expect(html.match(/data-block="Heading"/g)).toHaveLength(2);
    expect(html).toContain('id="first-site"');
    expect(html).toContain('text-align:center');
    expect(html).toContain('max-width:76rem');
    expect(html).toContain('padding-block:4rem');
    expect(html).toContain('alt="Image"');
    expect(html).toContain('<figcaption>Caption</figcaption>');
    expect(html).toContain('<summary>Synthetic question</summary>');
    expect(html).toContain('<strong>&lt;script&gt;x&lt;/script&gt;</strong>');
    expect(html).toContain('1px dashed currentColor');
  });

  it.each([
    [
      'https://www.youtube.com/watch?v=abcdefghijk&autoplay=1',
      'https://www.youtube-nocookie.com/embed/abcdefghijk',
    ],
    ['https://vimeo.com/123456', 'https://player.vimeo.com/video/123456'],
    [
      'https://www.google.com/maps/embed?pb=synthetic&extra=discard',
      'https://www.google.com/maps/embed?pb=synthetic',
    ],
  ])(
    're-resolves %s to its canonical iframe source at render time',
    (url, src) => {
      const html = renderToStaticMarkup(
        <Embed url={url} title="First site embed" aspect="4:3" />
      );
      expect(html).toContain(`src="${src}"`);
      expect(html).toContain('title="First site embed"');
      expect(html).toContain('aspect-ratio:4 / 3');
      expect(html).not.toContain('autoplay=1');
      expect(html).not.toContain('extra=discard');
    }
  );

  it.each([
    '',
    'javascript:alert(1)',
    'https://unapproved.invalid/embed',
    'https://www.youtube.com.evil.invalid/watch?v=abcdefghijk',
  ])('renders nothing for an unset or unsupported embed %s', (url) => {
    expect(
      renderToStaticMarkup(
        <Embed url={url} title="Synthetic embed" aspect="16:9" />
      )
    ).toBe('');
  });

  it('drops unsafe gallery URLs even when called without parsing', () => {
    const html = renderToStaticMarkup(
      <Gallery
        columns="2"
        aspect="auto"
        images={[
          { src: 'javascript:alert(1)', alt: 'Synthetic', caption: '' },
          { src: '/\\unapproved.invalid/a.png', alt: 'Synthetic', caption: '' },
        ]}
      />
    );
    expect(html).not.toContain('<img');
  });
});
