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
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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

function StackDetails({
  copy,
  stack,
}: {
  copy: typeof en.techStack;
  stack: TechStack;
}) {
  const framework = copy.stack[stack.framework];
  const bundler =
    stack.bundler === 'next'
      ? copy.nextBundler
      : stack.bundler === 'other'
        ? copy.unspecified
        : copy.stack[stack.bundler];
  const hosting = stack.hosting ? copy.stack[stack.hosting] : copy.unspecified;
  return (
    <>
      <span>
        {framework} · {bundler}
      </span>
      <span>
        {hosting}
        {stack.deployCli && ` · ${copy.stack[stack.deployCli]}`}
      </span>
      {stack.url && (
        <span className="wrap-anywhere">
          {stack.url.replace(/^https:\/\//, '')}
        </span>
      )}
    </>
  );
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
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map(({ id, status, current, targetUrl }) => (
            <li key={id} className="min-w-0">
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between gap-2 p-4 pb-2">
                  <CardTitle
                    role="heading"
                    aria-level={3}
                    className="truncate text-base"
                  >
                    {APP_NAMES[id] ?? id}
                  </CardTitle>
                  <Badge variant={variant[status]}>{copy.status[status]}</Badge>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-sm">
                  <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                    <dt className="text-muted-foreground text-xs">
                      {copy.current}
                    </dt>
                    <dd className="grid">
                      <StackDetails copy={copy} stack={current} />
                    </dd>
                    {targetUrl && (
                      <>
                        <dt className="text-muted-foreground text-xs">
                          {copy.target}
                        </dt>
                        <dd className="grid">
                          <StackDetails
                            copy={copy}
                            stack={{ ...TARGET_TECH_STACK, url: targetUrl }}
                          />
                        </dd>
                      </>
                    )}
                  </dl>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p>{copy.unavailable}</p>
      )}
    </section>
  );
}
