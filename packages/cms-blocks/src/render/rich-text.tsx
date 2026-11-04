import { Fragment, type ReactNode } from 'react';
import type { TipTapNode } from '../schema';

export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    if (['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return value;
  } catch { /* Invalid links render as text. */ }
}

export function safeImage(value: unknown): string | undefined {
  const href = safeHref(value);
  return href && !/^(mailto:|tel:|#)/.test(href) ? href : undefined;
}

export function RichTextNodes({ nodes = [] }: { nodes?: TipTapNode[] }) {
  return nodes.map((node, index) => <Fragment key={index}>{renderNode(node)}</Fragment>);
}

function renderNode(node: TipTapNode): ReactNode {
  const children = <RichTextNodes nodes={node.content} />;
  if (node.type === 'text') {
    let text: ReactNode = node.text ?? '';
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case 'bold': text = <strong>{text}</strong>; break;
        case 'italic': text = <em>{text}</em>; break;
        case 'strike': text = <s>{text}</s>; break;
        case 'underline': text = <u>{text}</u>; break;
        case 'code': text = <code>{text}</code>; break;
        case 'link': text = <a href={safeHref(mark.attrs?.href)}>{text}</a>; break;
      }
    }
    return text;
  }
  switch (node.type) {
    case 'doc': return children;
    case 'paragraph': return <p>{children}</p>;
    case 'heading': {
      switch (node.attrs?.level) {
        case 1: return <h1>{children}</h1>;
        case 2: return <h2>{children}</h2>;
        case 3: return <h3>{children}</h3>;
        case 4: return <h4>{children}</h4>;
        case 5: return <h5>{children}</h5>;
        default: return <h6>{children}</h6>;
      }
    }
    case 'bulletList': return <ul>{children}</ul>;
    case 'orderedList': return <ol>{children}</ol>;
    case 'listItem': return <li>{children}</li>;
    case 'blockquote': return <blockquote>{children}</blockquote>;
    case 'codeBlock': return <pre><code>{children}</code></pre>;
    case 'hardBreak': return <br />;
    case 'horizontalRule': return <hr />;
    case 'image': {
      const src = safeImage(node.attrs?.src);
      return src ? <img src={src} alt={typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''} loading="lazy" /> : null;
    }
    default: return children;
  }
}
