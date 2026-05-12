interface TipTapNode {
  type?: string;
  text?: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export function hasContent(content: unknown): boolean {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return false;
  }
  const doc = content as TipTapNode;
  return (doc.content ?? []).some(
    (node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0
  );
}

function isSafeHref(href: string): boolean {
  try {
    const url = new URL(href, 'https://placeholder.local');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
  } catch {
    return href.startsWith('/') || href.startsWith('#');
  }
}

export function RichContentRenderer({ content }: { content: unknown }) {
  if (!content || typeof content !== 'object') return null;
  const doc = content as TipTapNode;
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed">
      {(doc.content ?? []).map((node, i) => (
        <RenderNode key={i} node={node} />
      ))}
    </div>
  );
}

export function RenderNode({ node }: { node: TipTapNode }) {
  if (node.type === 'text') {
    let element: React.ReactNode = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') element = <strong>{element}</strong>;
      if (mark.type === 'italic') element = <em>{element}</em>;
      if (mark.type === 'code') {
        element = (
          <code className="border border-border bg-muted px-1 py-0.5 text-xs">
            {element}
          </code>
        );
      }
      if (mark.type === 'link') {
        const rawHref =
          typeof mark.attrs?.href === 'string' ? mark.attrs.href : '#';
        const href = isSafeHref(rawHref) ? rawHref : '#';
        element = (
          <a
            className="text-primary underline"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {element}
          </a>
        );
      }
    }
    return <>{element}</>;
  }

  const children = (node.content ?? []).map((child, i) => (
    <RenderNode key={i} node={child} />
  ));

  switch (node.type) {
    case 'paragraph':
      return <p className="mb-3 last:mb-0">{children}</p>;
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 2;
      if (level === 1) {
        return <h1 className="mb-3 font-black text-2xl">{children}</h1>;
      }
      if (level === 2) {
        return <h2 className="mb-2 font-bold text-xl">{children}</h2>;
      }
      return <h3 className="mb-2 font-bold text-lg">{children}</h3>;
    }
    case 'bulletList':
      return <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>;
    case 'orderedList':
      return <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>;
    case 'listItem':
      return <li>{children}</li>;
    case 'blockquote':
      return (
        <blockquote className="mb-3 border-border border-l-4 pl-4 text-muted-foreground italic">
          {children}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre className="mb-3 overflow-x-auto border-2 border-border bg-muted p-4 text-sm">
          <code>{children}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr className="my-4 border-border" />;
    case 'hardBreak':
      return <br />;
    default:
      return <>{children}</>;
  }
}
