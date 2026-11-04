import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Accordion, Divider, Gallery, Heading, Section, VideoEmbed } from './pending-blocks';

describe('synthetic pending-block previews', () => {
  it('renders semantic sections, escaped headings, disclosures and dividers', () => {
    const html = renderToStaticMarkup(<>
      <Section id="section" width="wide" content={[]} />
      <Heading id="heading" level={2} text="<First site>" />
      <Accordion id="faq" items={[{ title: 'Synthetic question', doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic answer' }] }] } }]} />
      <Divider id="divider" />
    </>);
    expect(html).toContain('<h2');
    expect(html).toContain('&lt;First site&gt;');
    expect(html).toContain('<summary>Synthetic question</summary>');
    expect(html).toContain('Synthetic answer');
    expect(html).toContain('<hr');
  });
  it('keeps image alternatives and refuses unsafe media or unapproved embeds', () => {
    const gallery = renderToStaticMarkup(<Gallery id="gallery" columns={2} images={[{ src: '/synthetic.png', alt: 'Synthetic image', caption: 'Caption' }, { src: 'javascript:alert(1)', alt: '' }]} />);
    expect(gallery).toContain('alt="Synthetic image"');
    expect(gallery).toContain('<figcaption>Caption</figcaption>');
    expect(gallery).not.toContain('javascript:');
    expect(renderToStaticMarkup(<VideoEmbed id="embed" kind="embed" src="https://unapproved.invalid/embed" title="Synthetic embed" />)).toBe('');
    const video = renderToStaticMarkup(<VideoEmbed id="video" kind="video" src="/synthetic.mp4" title="Synthetic video" captionsSrc="/synthetic.vtt" captionsLanguage="en" />);
    expect(video).toContain('controls=""');
    expect(video).toContain('kind="captions"');
  });
});
