import type { LettinDraft, LettinNode } from '@tuturuuu/internal-api/lettin';
import { Fragment, type ReactNode } from 'react';

function renderNode(node: LettinNode, depth = 0): ReactNode {
  if (depth > 25) return null;
  if (node.type === 'text') {
    let text: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = <strong>{text}</strong>;
      if (mark.type === 'italic') text = <em>{text}</em>;
      if (mark.type === 'strike') text = <s>{text}</s>;
      if (mark.type === 'code') text = <code>{text}</code>;
    }
    return text;
  }
  const children = node.content?.map((child, i) => (
    <Fragment key={`${depth}-${i}`}>{renderNode(child, depth + 1)}</Fragment>
  ));
  switch (node.type) {
    case 'paragraph':
      return <p>{children}</p>;
    case 'heading':
      return node.attrs?.level === 3 ? (
        <h3>{children}</h3>
      ) : (
        <h2>{children}</h2>
      );
    case 'bulletList':
      return <ul>{children}</ul>;
    case 'orderedList':
      return <ol>{children}</ol>;
    case 'listItem':
      return <li>{children}</li>;
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
    default:
      return children;
  }
}
export function DocumentView({ draft }: { draft: LettinDraft }) {
  return (
    <article className="lettin-prose">
      {draft.image && (
        // biome-ignore lint/performance/noImgElement: Artwork must bypass optimizer caching so private media access can be revoked.
        <img
          src={draft.image}
          alt={draft.title}
          referrerPolicy="no-referrer"
          className="mb-8 max-h-96 w-full object-cover"
        />
      )}
      <h1 className="break-words text-4xl md:text-5xl">{draft.title}</h1>
      {draft.credit && (
        <p className="text-muted-foreground text-sm">{draft.credit}</p>
      )}
      <p className="text-lg text-muted-foreground">{draft.description}</p>
      <div className="flex flex-wrap gap-2">
        {draft.tags.map((tag) => (
          <span
            className="border border-foreground bg-secondary px-3 py-1 font-bold text-xs uppercase tracking-wider"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
      {renderNode(draft.content)}
    </article>
  );
}
