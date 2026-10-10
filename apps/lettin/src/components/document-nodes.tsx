import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { Fragment, type ReactNode } from 'react';
export const safeDocumentHref = (value: unknown) =>
  typeof value === 'string' && /^(https?:\/\/|mailto:)/i.test(value)
    ? value
    : undefined;
export const safeDocumentImage = (value: unknown) =>
  typeof value === 'string' &&
  (/^https:\/\//i.test(value) ||
    /^\/api\/v1\/lettin\/media\/[0-9a-f-]{36}$/.test(value))
    ? value
    : undefined;
export function renderDocumentNode(
  node: LettinNode,
  depth = 0,
  labels = { completed: '', incomplete: '' },
  outline?: { ids: ReadonlyMap<string, string>; path: string }
): ReactNode {
  if (depth > 25) return null;
  if (node.type === 'text') {
    let text: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case 'bold':
          text = <strong>{text}</strong>;
          break;
        case 'italic':
          text = <em>{text}</em>;
          break;
        case 'strike':
          text = <s>{text}</s>;
          break;
        case 'code':
          text = <code>{text}</code>;
          break;
        case 'underline':
          text = <u>{text}</u>;
          break;
        case 'subscript':
          text = <sub>{text}</sub>;
          break;
        case 'superscript':
          text = <sup>{text}</sup>;
          break;
        case 'highlight':
          text = <mark>{text}</mark>;
          break;
        case 'link': {
          const href = safeDocumentHref(mark.attrs?.href);
          if (href)
            text = (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {text}
              </a>
            );
          break;
        }
      }
    }
    return text;
  }
  const children = node.content?.map((child, i) => (
    <Fragment key={`${depth}-${i}`}>
      {renderDocumentNode(
        child,
        depth + 1,
        labels,
        outline ? { ids: outline.ids, path: `${outline.path}.${i}` } : undefined
      )}
    </Fragment>
  ));
  switch (node.type) {
    case 'paragraph':
      return <p>{children}</p>;
    case 'heading': {
      const level = Number(node.attrs?.level);
      const Heading =
        `h${[1, 2, 3, 4, 5, 6].includes(level) ? level : 2}` as 'h1';
      const id = outline?.ids.get(outline.path);
      return (
        <Heading
          id={id}
          data-lettin-heading={id ? '' : undefined}
          tabIndex={id ? -1 : undefined}
          className={
            id
              ? 'scroll-mt-24 focus:outline focus:outline-2 focus:outline-ring'
              : undefined
          }
        >
          {children}
        </Heading>
      );
    }
    case 'bulletList':
    case 'taskList':
      return <ul>{children}</ul>;
    case 'orderedList':
      return (
        <ol
          start={
            typeof node.attrs?.start === 'number' ? node.attrs.start : undefined
          }
        >
          {children}
        </ol>
      );
    case 'listItem':
      return <li>{children}</li>;
    case 'taskItem':
      return (
        <li>
          <input
            type="checkbox"
            checked={node.attrs?.checked === true}
            readOnly
            tabIndex={-1}
            aria-label={
              node.attrs?.checked ? labels.completed : labels.incomplete
            }
          />
          {children}
        </li>
      );
    case 'blockquote':
      return <blockquote>{children}</blockquote>;
    case 'codeBlock':
      return (
        <pre>
          <code>{children}</code>
        </pre>
      );
    case 'hardBreak':
      return <br />;
    case 'horizontalRule':
      return <hr />;
    case 'table':
      return (
        <div className="wiki-table-scroll">
          <table>
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr>{children}</tr>;
    case 'tableCell':
    case 'tableHeader': {
      const Cell = node.type === 'tableCell' ? 'td' : 'th';
      return (
        <Cell
          colSpan={Math.max(1, Math.min(30, Number(node.attrs?.colspan) || 1))}
          rowSpan={Math.max(1, Math.min(30, Number(node.attrs?.rowspan) || 1))}
        >
          {children}
        </Cell>
      );
    }
    case 'details':
      return <details>{children}</details>;
    case 'detailsSummary':
      return <summary>{children}</summary>;
    case 'detailsContent':
      return <div>{children}</div>;
    case 'image':
    case 'imageResize': {
      const src = safeDocumentImage(node.attrs?.src);
      return src ? (
        // biome-ignore lint/performance/noImgElement: Revocable media bypasses optimizer caching.
        <img
          src={src}
          alt={typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : null;
    }
    default:
      return children;
  }
}
