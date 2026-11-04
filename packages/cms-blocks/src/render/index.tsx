import type { CmsBlock, CmsBlockPropsOf, CmsPage } from '../schema';
import { RichTextNodes, safeHref, safeImage } from './rich-text';

export function Hero(props: CmsBlockPropsOf<'Hero'>) {
  const src = safeImage(props.imageUrl);
  return <section className="cms-hero">
    <h1>{props.title}</h1><p>{props.subtitle}</p>
    {src && <img src={src} alt="" />}
    {props.ctaLabel && <a className="cms-button" href={safeHref(props.ctaHref)}>{props.ctaLabel}</a>}
  </section>;
}

export function RichText({ doc }: CmsBlockPropsOf<'RichText'>) {
  return <div className="cms-rich-text"><RichTextNodes nodes={doc.content} /></div>;
}

export function Image({ src, alt, caption }: CmsBlockPropsOf<'Image'>) {
  const url = safeImage(src);
  return url ? <figure><img src={url} alt={alt} loading="lazy" />{caption && <figcaption>{caption}</figcaption>}</figure> : null;
}

export function CtaButton({ href, label, variant }: CmsBlockPropsOf<'CtaButton'>) {
  return <a className={`cms-button cms-button-${variant}`} href={safeHref(href)}>{label}</a>;
}

export function CardGrid({ cards, columns }: CmsBlockPropsOf<'CardGrid'>) {
  return <div className="cms-card-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {cards.map((card, index) => <article key={index}>
      <Image id={`card-${index}`} src={card.imageUrl} alt="" caption="" />
      <h2><a href={safeHref(card.href)}>{card.title}</a></h2><p>{card.body}</p>
    </article>)}
  </div>;
}

export function EventList({ events, heading }: CmsBlockPropsOf<'EventList'>) {
  return <section><h2>{heading}</h2><ul>{events.map((event, index) => <li key={index}>
    <a href={safeHref(event.href)}>{event.title}</a><p>{event.startsAt}</p><p>{event.location}</p>
  </li>)}</ul></section>;
}

export function EventDetails(props: CmsBlockPropsOf<'EventDetails'>) {
  return <article><h1>{props.title}</h1><p>{props.startsAt} – {props.endsAt}</p><p>{props.location}</p>
    <RichText id={`${props.id}-description`} doc={props.description} />
    {props.registerHref && <a href={safeHref(props.registerHref)}>{props.title}</a>}
  </article>;
}

const spacing = { sm: 16, md: 32, lg: 64, xl: 96 };
export function Spacer({ size }: CmsBlockPropsOf<'Spacer'>) {
  return <div aria-hidden="true" style={{ height: spacing[size] }} />;
}

const ratios = { '1:1': '1fr 1fr', '1:2': '1fr 2fr', '2:1': '2fr 1fr' };
export function TwoColumn({ left, right, ratio }: CmsBlockPropsOf<'TwoColumn'>) {
  return <div className="cms-columns" style={{ gridTemplateColumns: ratios[ratio] }}>
    <div>{left.map((block) => <RenderBlock key={block.props.id} block={block} />)}</div>
    <div>{right.map((block) => <RenderBlock key={block.props.id} block={block} />)}</div>
  </div>;
}

export function RenderBlock({ block }: { block: CmsBlock }) {
  switch (block.type) {
    case 'Hero': return <Hero {...block.props} />;
    case 'RichText': return <RichText {...block.props} />;
    case 'Image': return <Image {...block.props} />;
    case 'CtaButton': return <CtaButton {...block.props} />;
    case 'CardGrid': return <CardGrid {...block.props} />;
    case 'EventList': return <EventList {...block.props} />;
    case 'EventDetails': return <EventDetails {...block.props} />;
    case 'Spacer': return <Spacer {...block.props} />;
    case 'TwoColumn': return <TwoColumn {...block.props} />;
    default: { const unreachable: never = block; return unreachable; }
  }
}

export function RenderPage({ page }: { page: CmsPage }) {
  return <main className="cms-page">{page.content.map((block) => <RenderBlock key={block.props.id} block={block} />)}</main>;
}
