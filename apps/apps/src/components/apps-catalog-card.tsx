import { ArrowUpRight, LayoutGrid } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { APP_ICONS, CATEGORY_TONES } from './apps-catalog-config';
import type { CatalogApp } from './apps-catalog-types';

export function AppCatalogCard({
  app,
  categoryLabel,
  openLabel,
}: {
  app: CatalogApp;
  categoryLabel: string;
  openLabel: string;
}) {
  const Icon = APP_ICONS[app.slug] ?? LayoutGrid;
  const tone = CATEGORY_TONES[app.category];

  return (
    <Link
      aria-label={`${openLabel}: ${app.title}`}
      className={cn(
        'group relative flex min-h-60 flex-col overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.045] to-transparent p-6 transition-[border-color,background-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_-40px_rgb(0_0_0/0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        tone.surface
      )}
      href={app.href}
      prefetch={false}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={cn(
            'flex size-12 items-center justify-center rounded-2xl border shadow-sm transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none',
            tone.icon
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="flex size-9 items-center justify-center rounded-full border border-transparent text-foreground/35 transition-all duration-300 group-hover:translate-x-0.5 group-hover:border-foreground/10 group-hover:bg-background/70 group-hover:text-foreground">
          <ArrowUpRight className="size-4" />
        </span>
      </div>

      <div className="mt-auto pt-10">
        <span className="font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.18em]">
          {categoryLabel}
        </span>
        <h3 className="mt-2 font-display font-semibold text-2xl tracking-[-0.025em]">
          {app.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-foreground/50 text-sm leading-relaxed">
          {app.description}
        </p>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
    </Link>
  );
}
