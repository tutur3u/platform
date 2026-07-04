import { ArrowRight } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ShowcaseCategory } from './component-registry';
import type { PreviewEntry } from './preview-thumbnail';
import { PreviewThumbnail } from './preview-thumbnail';
import { getAccent } from './ui-docs-theme';

export function ComponentIndexCard({
  href,
  name,
  description,
  importPath,
  category,
  entry,
}: {
  href: string;
  name: string;
  description: string;
  importPath: string;
  category: ShowcaseCategory;
  entry?: PreviewEntry;
}) {
  const a = getAccent(category);

  return (
    <Link
      className={cn(
        'group relative grid overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:border-transparent hover:shadow-md focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-4',
        a.ring
      )}
      href={href}
    >
      <span
        className={cn(
          'absolute inset-x-0 top-0 z-10 h-0.5 origin-left scale-x-0 bg-gradient-to-r transition-transform duration-300 group-hover:scale-x-100',
          a.gradient
        )}
      />
      <div className="relative border-b bg-muted/20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_8%,transparent)_1px,transparent_1px)] bg-[size:1.25rem_1.25rem] opacity-50" />
        {entry ? (
          <PreviewThumbnail className="relative" entry={entry} />
        ) : (
          <div className="min-h-40" />
        )}
      </div>
      <div className="grid gap-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{name}</h3>
          <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
        <code className="font-mono text-muted-foreground text-xs">
          {importPath}
        </code>
      </div>
    </Link>
  );
}
