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
  return (
    <>
      <p>
        {copy.stack[stack.framework]} ·{' '}
        {stack.bundler === 'next'
          ? copy.nextBundler
          : stack.bundler === 'other'
            ? copy.unspecified
            : copy.stack[stack.bundler]}
      </p>
      <p>
        {stack.hosting ? copy.stack[stack.hosting] : copy.unspecified}
        {stack.deployCli && ` · ${copy.stack[stack.deployCli]}`}
      </p>
      {stack.url && (
        <p className="wrap-anywhere">{stack.url.replace(/^https:\/\//, '')}</p>
      )}
    </>
  );
}

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
  const sorted = [...apps].sort(
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
                <CardContent className="grid gap-2 p-4 pt-0 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">
                      {copy.current}
                    </p>
                    <StackDetails copy={copy} stack={current} />
                  </div>
                  {targetUrl && (
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {copy.target}
                      </p>
                      <StackDetails
                        copy={copy}
                        stack={{ ...TARGET_TECH_STACK, url: targetUrl }}
                      />
                    </div>
                  )}
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
