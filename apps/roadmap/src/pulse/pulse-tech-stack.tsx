import type { Lang } from '@tuturuuu/roadmap-core/components/shared.tsx';
import { APP_NAMES } from '@tuturuuu/roadmap-core/live/host-probe.ts';
import en from '@tuturuuu/roadmap-core/messages/en.json';
import vi from '@tuturuuu/roadmap-core/messages/vi.json';
import {
  type AppTechStack,
  TARGET_TECH_STACK,
  type TechStack,
} from '@tuturuuu/roadmap-core/tech-stack.ts';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Segmented } from '@tuturuuu/roadmap-core/components/ds/segmented.tsx';
import { useState } from 'react';

const variant = {
  cutOver: 'success',
  candidate: 'warning',
  held: 'secondary',
  paused: 'outline',
  outside: 'outline',
} satisfies Record<
  AppTechStack['status'],
  'success' | 'warning' | 'secondary' | 'outline'
>;

const ORDER: Record<AppTechStack['status'], number> = {
  cutOver: 0,
  candidate: 1,
  held: 2,
  paused: 3,
  outside: 4,
};

/** One line: framework, bundler, hosting and deploy CLI. */
function stackLine(copy: typeof en.techStack, stack: Omit<TechStack, 'url'>) {
  const bundler =
    stack.bundler === 'next'
      ? copy.nextBundler
      : stack.bundler === 'other'
        ? copy.unspecified
        : copy.stack[stack.bundler];
  return [
    copy.stack[stack.framework],
    bundler,
    stack.hosting ? copy.stack[stack.hosting] : copy.unspecified,
    stack.deployCli ? copy.stack[stack.deployCli] : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

type Show = 'migrating' | 'outside' | 'all';
const OUTSIDE = new Set<AppTechStack['status']>(['paused', 'outside']);

/**
 * How far the move to TanStack Start on Cloudflare has come: one progress
 * figure, then every app with its current stack and, where it has one, the
 * target route.
 */
export function PulseTechStack({
  apps,
  lang,
}: {
  apps: readonly AppTechStack[];
  lang: Lang;
}) {
  const copy = (lang === 'en' ? en : vi).techStack;
  const total = apps.filter((app) => app.targetUrl).length;
  const cutOver = apps.filter((app) => app.status === 'cutOver').length;
  const progress = copy.progress
    .replace('{done}', String(cutOver))
    .replace('{total}', String(total));
  const [show, setShow] = useState<Show>('migrating');
  const shown = apps.filter((app) =>
    show === 'all' ? true : OUTSIDE.has(app.status) === (show === 'outside')
  );
  const sorted = [...shown].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      (APP_NAMES[a.id] ?? a.id).localeCompare(APP_NAMES[b.id] ?? b.id)
  );

  return (
    <section
      className="grid gap-4"
      aria-labelledby="pulse-tech-stack-title"
      id="tech-stack"
    >
      <header className="grid gap-1.5">
        <h2
          id="pulse-tech-stack-title"
          className="font-semibold text-xl tracking-tight"
        >
          {copy.title}
        </h2>
        <p className="text-muted-foreground text-sm">{copy.source}</p>
      </header>
      {total > 0 && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:p-5">
            <p className="font-medium">{progress}</p>
            <p className="text-muted-foreground text-sm">
              {copy.target}: {stackLine(copy, TARGET_TECH_STACK)}
            </p>
            <Progress
              aria-label={progress}
              aria-valuenow={cutOver}
              value={cutOver}
              max={total}
              className="h-2.5"
              indicatorStyle={{
                transform: `translateX(-${100 - (cutOver * 100) / total}%)`,
              }}
            />
          </CardContent>
        </Card>
      )}
      {apps.length > 0 && (
        <Segmented
          label={copy.filterLabel}
          value={show}
          onChange={setShow}
          options={[
            { value: 'migrating', label: copy.filterMigrating },
            { value: 'outside', label: copy.status.outside },
            { value: 'all', label: copy.filterAll },
          ]}
        />
      )}
      {apps.length > 0 ? (
        <Card>
          <ul className="divide-y">
            {sorted.map(({ id, status, current, targetUrl }) => (
              <li
                key={id}
                className="grid gap-x-4 gap-y-1 px-4 py-3 text-sm md:grid-cols-[minmax(0,12rem)_6.5rem_minmax(0,1fr)_minmax(0,1fr)] md:items-start"
              >
                <div className="flex min-w-0 items-center justify-between gap-2 md:grid md:justify-start">
                  <span className="truncate font-medium">
                    {APP_NAMES[id] ?? id}
                  </span>
                  <Badge variant={variant[status]} className="md:hidden">
                    {copy.status[status]}
                  </Badge>
                  {current.url && (
                    <span className="wrap-anywhere hidden text-muted-foreground text-xs md:block">
                      {current.url.replace(/^https:\/\//, '')}
                    </span>
                  )}
                </div>
                <Badge
                  variant={variant[status]}
                  className="hidden self-start md:inline-flex"
                >
                  {copy.status[status]}
                </Badge>
                <p className="grid gap-0.5 md:gap-0">
                  <span className="text-muted-foreground text-xs md:sr-only">
                    {copy.current}
                  </span>
                  {stackLine(copy, current)}
                </p>
                {targetUrl && (
                  <p className="grid gap-0.5 md:gap-0">
                    <span className="text-muted-foreground text-xs md:sr-only">
                      {copy.target}
                    </span>
                    <span className="wrap-anywhere">
                      {targetUrl.replace(/^https:\/\//, '')}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <p>{copy.unavailable}</p>
      )}
    </section>
  );
}
