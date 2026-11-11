import { Clock } from '@tuturuuu/icons/lucide';

interface TocItem {
  id: string;
  title: string;
  number: number;
}

interface TableOfContentsProps {
  items: TocItem[];
  effectiveDate: string;
}

/**
 * The document index.
 *
 * Numbers are monospace and the rows hang off a hairline rail, so it reads as
 * a contents list rather than another card of links.
 */
export function TableOfContents({
  items,
  effectiveDate,
}: TableOfContentsProps) {
  return (
    <nav className="relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />

      <h2 className="font-mono-ui text-[0.62rem] text-foreground/40 uppercase tracking-[0.2em]">
        Contents
      </h2>

      <p className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-foreground/35">
        <Clock className="h-3 w-3" />
        <span>
          Updated{' '}
          {new Date(effectiveDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </p>

      <ol className="mt-4 max-h-[calc(100vh-16rem)] space-y-0.5 overflow-y-auto border-foreground/[0.07] border-t pt-3 pr-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-foreground/50 text-sm transition-colors duration-300 hover:bg-foreground/[0.03] hover:text-foreground"
              href={`#${item.id}`}
            >
              <span className="mt-0.5 shrink-0 font-mono-ui text-[0.58rem] text-foreground/25 tabular-nums transition-colors duration-300 group-hover:text-foreground/50">
                {item.number.toString().padStart(2, '0')}
              </span>
              <span className="min-w-0 leading-snug">{item.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
