import type { ReactNode } from 'react';
import type { CitationFormattedRun } from './types';

function safeHref(value: string | undefined): string | undefined {
  if (!value || value.length > 4000) return undefined;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Renders formatter runs as React text and marks; never as HTML. */
export function FormattedRuns({ runs }: { runs: CitationFormattedRun[] }) {
  return runs.map((run, index) => {
    let content: ReactNode = run.text;
    if (run.italic) content = <em>{content}</em>;
    if (run.bold) content = <strong>{content}</strong>;
    if (run.vertical === 'superscript') content = <sup>{content}</sup>;
    if (run.vertical === 'subscript') content = <sub>{content}</sub>;
    const href = safeHref(run.href);
    if (href) {
      content = (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          {content}
        </a>
      );
    }
    // Runs are positional output of one formatter pass; position is identity.
    return <span key={`run-${index}`}>{content}</span>;
  });
}
