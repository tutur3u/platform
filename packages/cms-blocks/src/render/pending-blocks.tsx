import type {
  AccordionFixtureProps, DividerFixtureProps, GalleryFixtureProps,
  HeadingFixtureProps, SectionFixtureProps, VideoEmbedFixtureProps,
} from './fixture-types';
import { renderCmsBlock, RichText, safeUrl } from './render';

export function Section({ id, width, content }: SectionFixtureProps) {
  const widths = { narrow: '40rem', wide: '76rem', full: 'none' };
  return <section data-block="Section" data-id={id} className="cms-section">
    <div style={{ maxWidth: widths[width], marginInline: 'auto' }}>{content.map(renderCmsBlock)}</div>
  </section>;
}

export function Heading({ id, text, level }: HeadingFixtureProps) {
  const tags = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const;
  const Tag = tags[level];
  return <Tag data-block="Heading" data-id={id}>{text}</Tag>;
}

function mediaUrl(value: string): string | undefined {
  const url = safeUrl(value);
  return url && /^(https?:|\/)/i.test(url) ? url : undefined;
}

export function Gallery({ id, columns, images }: GalleryFixtureProps) {
  return <div data-block="Gallery" data-id={id} className="cms-gallery" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {images.map((item, index) => <figure key={index}>
      {mediaUrl(item.src) && <img src={mediaUrl(item.src)} alt={item.alt} loading="lazy" />}
      {item.caption && <figcaption>{item.caption}</figcaption>}
    </figure>)}
  </div>;
}

export function VideoEmbed(props: VideoEmbedFixtureProps) {
  if (props.kind === 'video') {
    const src = mediaUrl(props.src);
    return src ? <video data-block="VideoEmbed" data-id={props.id} src={src} controls preload="metadata" aria-label={props.title}>
      {mediaUrl(props.captionsSrc) && <track kind="captions" src={mediaUrl(props.captionsSrc)} srcLang={props.captionsLanguage} />}
    </video> : null;
  }
  let embed: URL;
  try { embed = new URL(props.src); } catch { return null; }
  const supported = (embed.hostname === 'www.youtube-nocookie.com' && embed.pathname.startsWith('/embed/'))
    || (embed.hostname === 'player.vimeo.com' && embed.pathname.startsWith('/video/'));
  if (embed.protocol !== 'https:' || embed.username || embed.password || !supported) return null;
  return <iframe data-block="VideoEmbed" data-id={props.id} src={embed.href} title={props.title} loading="lazy"
    sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="no-referrer" allowFullScreen />;
}

export function Accordion({ id, items }: AccordionFixtureProps) {
  return <div data-block="Accordion" data-id={id} className="cms-accordion">
    {items.map((item, index) => <details key={index}><summary>{item.title}</summary>
      <RichText id={`${id}-${index}`} doc={item.doc} />
    </details>)}
  </div>;
}

export function Divider({ id }: DividerFixtureProps) {
  return <hr data-block="Divider" data-id={id} />;
}
