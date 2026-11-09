import { resolveCmsEmbed } from '../schema/embed';
import type { CmsBlockPropsOf, CmsBlockType } from '../schema/schema';
import { safeUrl } from './safe-url';

type Props<T extends CmsBlockType> = Omit<CmsBlockPropsOf<T>, 'id'>;

export function Heading({ align, anchor, level, text }: Props<'Heading'>) {
  const tags = {
    '1': 'h1',
    '2': 'h2',
    '3': 'h3',
    '4': 'h4',
    '5': 'h5',
    '6': 'h6',
  } as const;
  const Tag = tags[level];
  return (
    <Tag
      id={anchor || undefined}
      data-block="Heading"
      style={{ textAlign: align }}
    >
      {text}
    </Tag>
  );
}

function imageUrl(value: string): string | undefined {
  const safe = safeUrl(value);
  return safe && /^(https?:|\/)/i.test(safe) ? safe : undefined;
}

export function Gallery({ aspect, columns, images }: Props<'Gallery'>) {
  const ratios = { auto: 'auto', square: '1 / 1', video: '16 / 9' };
  return (
    <div
      data-block="Gallery"
      className="cms-gallery"
      style={{
        display: 'grid',
        gap: '1rem',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {images.map((image, index) => (
        <figure key={index}>
          {imageUrl(image.src) && (
            <img
              src={imageUrl(image.src)}
              alt={image.alt}
              loading="lazy"
              style={{
                width: '100%',
                aspectRatio: ratios[aspect],
                objectFit: 'cover',
              }}
            />
          )}
          {image.caption && <figcaption>{image.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

export function Embed({ aspect, title, url }: Props<'Embed'>) {
  const resolved = resolveCmsEmbed(url);
  if (!resolved) return null;
  const ratios = { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1' };
  return (
    <iframe
      data-block="Embed"
      data-provider={resolved.provider}
      src={resolved.src}
      title={title}
      loading="lazy"
      style={{ width: '100%', aspectRatio: ratios[aspect], border: 0 }}
      sandbox="allow-scripts allow-same-origin allow-presentation"
      referrerPolicy="no-referrer"
      allowFullScreen
    />
  );
}

export function Divider({ spacing, variant }: Props<'Divider'>) {
  const margins = { sm: '1rem', md: '2rem', lg: '4rem' };
  return (
    <hr
      data-block="Divider"
      style={{
        border: 0,
        borderTop: `1px ${variant} currentColor`,
        marginBlock: margins[spacing],
      }}
    />
  );
}
