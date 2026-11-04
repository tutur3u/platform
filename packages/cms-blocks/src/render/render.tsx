import { Fragment, type ReactNode } from 'react';
import type {
  CmsBlock,
  CmsBlockPropsOf,
  CmsBlockType,
  CmsPage,
  TipTapNode,
} from '../schema/schema';
import { Divider, Embed, Gallery, Heading } from './contract-blocks';
import { safeUrl } from './safe-url';

export { Divider, Embed, Gallery, Heading } from './contract-blocks';
export { safeUrl } from './safe-url';

const NODE_TAGS: Record<string, string> = {
  blockquote: 'blockquote',
  bulletList: 'ul',
  listItem: 'li',
  orderedList: 'ol',
  paragraph: 'p',
};
const MARK_TAGS: Record<string, string> = {
  bold: 'strong',
  code: 'code',
  italic: 'em',
  strike: 's',
  underline: 'u',
};

function renderTipTapNode(node: TipTapNode, key: number): ReactNode {
  if (node.type === 'text') {
    const marked = (node.marks ?? []).reduce<ReactNode>((child, mark) => {
      if (mark.type === 'link') {
        const href = safeUrl(String(mark.attrs?.href ?? ''));
        return href ? (
          <a href={href} key={mark.type} rel="noopener noreferrer">
            {child}
          </a>
        ) : (
          child
        );
      }
      const Tag = MARK_TAGS[mark.type] as 'strong' | undefined;
      return Tag ? <Tag key={mark.type}>{child}</Tag> : child;
    }, node.text ?? '');
    return <Fragment key={key}>{marked}</Fragment>;
  }
  if (node.type === 'hardBreak') return <br key={key} />;
  if (node.type === 'horizontalRule') return <hr key={key} />;
  const children = node.content?.map(renderTipTapNode);
  const level = Number(node.attrs?.level);
  const Tag = (
    node.type === 'heading'
      ? `h${level >= 1 && level <= 6 ? level : 2}`
      : NODE_TAGS[node.type]
  ) as 'p' | undefined;
  return Tag ? (
    <Tag key={key}>{children}</Tag>
  ) : (
    <span key={key}>{children}</span>
  );
}

export function TipTapContent({ doc }: { doc: { content?: TipTapNode[] } }) {
  return <>{doc.content?.map(renderTipTapNode)}</>;
}

type Props<T extends CmsBlockType> = Omit<CmsBlockPropsOf<T>, 'id'>;

export function Hero({
  ctaHref,
  ctaLabel,
  imageUrl,
  subtitle,
  title,
}: Props<'Hero'>) {
  const href = safeUrl(ctaHref);
  return (
    <section className="cms-hero" data-block="Hero">
      {safeUrl(imageUrl) ? <img alt="" src={safeUrl(imageUrl)} /> : null}
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {href && ctaLabel ? (
        <a className="cms-button" href={href}>
          {ctaLabel}
        </a>
      ) : null}
    </section>
  );
}

export function RichText({ doc }: Props<'RichText'>) {
  return (
    <div className="cms-richtext" data-block="RichText">
      <TipTapContent doc={doc} />
    </div>
  );
}

export function Image({ alt, caption, src }: Props<'Image'>) {
  return (
    <figure className="cms-image" data-block="Image">
      {safeUrl(src) ? (
        <img alt={alt} loading="lazy" src={safeUrl(src)} />
      ) : null}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export function CtaButton({ href, label, variant }: Props<'CtaButton'>) {
  return (
    <a
      className="cms-button"
      data-block="CtaButton"
      data-variant={variant}
      href={safeUrl(href)}
    >
      {label}
    </a>
  );
}

export function CardGrid({ cards, columns }: Props<'CardGrid'>) {
  return (
    <div className="cms-card-grid" data-block="CardGrid" data-columns={columns}>
      {cards.map((card, index) => (
        <article className="cms-card" key={`${card.title}-${index}`}>
          {safeUrl(card.imageUrl) ? (
            <img alt="" loading="lazy" src={safeUrl(card.imageUrl)} />
          ) : null}
          <h3>
            {safeUrl(card.href) ? (
              <a href={safeUrl(card.href)}>{card.title}</a>
            ) : (
              card.title
            )}
          </h3>
          {card.body ? <p>{card.body}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function EventList({ events, heading }: Props<'EventList'>) {
  return (
    <section className="cms-event-list" data-block="EventList">
      {heading ? <h2>{heading}</h2> : null}
      <ul>
        {events.map((event, index) => (
          <li key={`${event.title}-${index}`}>
            <time>{event.startsAt}</time>{' '}
            {safeUrl(event.href) ? (
              <a href={safeUrl(event.href)}>{event.title}</a>
            ) : (
              event.title
            )}
            {event.location ? <span> · {event.location}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventDetails(props: Props<'EventDetails'>) {
  const registerHref = safeUrl(props.registerHref);
  return (
    <section className="cms-event-details" data-block="EventDetails">
      <h2>{props.title}</h2>
      <p>
        <time>{props.startsAt}</time>
        {props.endsAt ? (
          <>
            {' '}
            – <time>{props.endsAt}</time>
          </>
        ) : null}
        {props.location ? <> · {props.location}</> : null}
      </p>
      <TipTapContent doc={props.description} />
      {registerHref ? (
        <a className="cms-button" href={registerHref}>
          Register
        </a>
      ) : null}
    </section>
  );
}

export function Spacer({ size }: Props<'Spacer'>) {
  return (
    <div
      aria-hidden
      className="cms-spacer"
      data-block="Spacer"
      data-size={size}
    />
  );
}

export function TwoColumnLayout(props: {
  left: ReactNode;
  ratio: string;
  right: ReactNode;
}) {
  return (
    <div
      className="cms-two-column"
      data-block="TwoColumn"
      data-ratio={props.ratio}
    >
      <div>{props.left}</div>
      <div>{props.right}</div>
    </div>
  );
}

export function Section({
  anchor,
  background,
  children,
  padding,
  width,
}: Props<'Section'>) {
  const widths = {
    narrow: '40rem',
    default: '64rem',
    wide: '76rem',
    full: 'none',
  };
  const spacing = { none: 0, sm: '1rem', md: '2rem', lg: '4rem' };
  const backgrounds = {
    none: 'transparent',
    muted: 'var(--cms-muted, var(--muted, transparent))',
    accent: 'var(--cms-accent, var(--accent, transparent))',
  };
  return (
    <section
      id={anchor || undefined}
      data-block="Section"
      data-background={background}
      className="cms-section"
      style={{
        background: backgrounds[background],
        paddingBlock: spacing[padding],
      }}
    >
      <div style={{ maxWidth: widths[width], marginInline: 'auto' }}>
        {children.map(renderCmsBlock)}
      </div>
    </section>
  );
}

export function Accordion({ heading, items }: Props<'Accordion'>) {
  return (
    <section data-block="Accordion" className="cms-accordion">
      {heading && <h2>{heading}</h2>}
      {items.map((item, index) => (
        <details key={index}>
          <summary>{item.question}</summary>
          <TipTapContent doc={item.answer} />
        </details>
      ))}
    </section>
  );
}

export const cmsLeafRenderers = {
  Accordion,
  CardGrid,
  CtaButton,
  Divider,
  Embed,
  EventDetails,
  EventList,
  Gallery,
  Heading,
  Hero,
  Image,
  RichText,
  Spacer,
} as const;

/** Pure, SSR-safe block renderer shared by the editor preview and the public site renderer. */
export function renderCmsBlock(block: CmsBlock): ReactNode {
  if (block.type === 'Section')
    return <Section key={block.props.id} {...block.props} />;
  if (block.type === 'TwoColumn') {
    const { left, ratio, right } = block.props;
    return (
      <TwoColumnLayout
        key={block.props.id}
        left={left.map(renderCmsBlock)}
        ratio={ratio}
        right={right.map(renderCmsBlock)}
      />
    );
  }
  switch (block.type) {
    case 'Accordion':
      return <Accordion key={block.props.id} {...block.props} />;
    case 'CardGrid':
      return <CardGrid key={block.props.id} {...block.props} />;
    case 'CtaButton':
      return <CtaButton key={block.props.id} {...block.props} />;
    case 'Divider':
      return <Divider key={block.props.id} {...block.props} />;
    case 'Embed':
      return <Embed key={block.props.id} {...block.props} />;
    case 'EventDetails':
      return <EventDetails key={block.props.id} {...block.props} />;
    case 'EventList':
      return <EventList key={block.props.id} {...block.props} />;
    case 'Gallery':
      return <Gallery key={block.props.id} {...block.props} />;
    case 'Heading':
      return <Heading key={block.props.id} {...block.props} />;
    case 'Hero':
      return <Hero key={block.props.id} {...block.props} />;
    case 'Image':
      return <Image key={block.props.id} {...block.props} />;
    case 'RichText':
      return <RichText key={block.props.id} {...block.props} />;
    case 'Spacer':
      return <Spacer key={block.props.id} {...block.props} />;
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
}

export function CmsPageRenderer({ page }: { page: CmsPage }) {
  return <main className="cms-page">{page.content.map(renderCmsBlock)}</main>;
}
