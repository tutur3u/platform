import { BugPlay, Gauge } from '@tuturuuu/icons';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CrawlerReadOnlyShellProps } from './types';

export function CrawlerReadOnlyShell({
  activeView,
  children,
  crawledHref,
  labels,
  uncrawledHref,
}: CrawlerReadOnlyShellProps) {
  return (
    <div className="space-y-6">
      <FeatureSummary
        description={labels.feature.description}
        pluralTitle={labels.feature.pluralTitle}
        singularTitle={labels.feature.singularTitle}
      />

      <nav
        className="flex flex-wrap gap-2"
        aria-label={labels.feature.pluralTitle}
      >
        <CrawlerNavLink
          active={activeView === 'crawled'}
          href={crawledHref}
          icon={<Gauge className="h-4 w-4" />}
          label={labels.navigation.crawled}
        />
        <CrawlerNavLink
          active={activeView === 'uncrawled'}
          href={uncrawledHref}
          icon={<BugPlay className="h-4 w-4" />}
          label={labels.navigation.uncrawled}
        />
      </nav>

      <Separator />
      {children}
    </div>
  );
}

function CrawlerNavLink({
  active,
  href,
  icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 font-medium text-sm transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      href={href}
    >
      {icon}
      {label}
    </Link>
  );
}
