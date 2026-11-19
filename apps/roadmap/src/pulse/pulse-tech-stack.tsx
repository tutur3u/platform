import type { Lang } from '@tuturuuu/roadmap-core/components/shared.tsx';
import { APP_NAMES } from '@tuturuuu/roadmap-core/live/host-probe.ts';
import en from '@tuturuuu/roadmap-core/messages/en.json';
import vi from '@tuturuuu/roadmap-core/messages/vi.json';
import {
  type AppTechStack,
  TARGET_TECH_STACK,
  type TechStack,
} from '@tuturuuu/roadmap-core/tech-stack.ts';

const statusClass = {
  cutOver: 'live',
  candidate: 'in_progress',
  held: 'waiting_for_merge',
  paused: 'planned',
  outside: 'planned',
} satisfies Record<AppTechStack['status'], string>;

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

  return (
    <section className="pulse-section" aria-labelledby="pulse-tech-stack-title">
      <header className="pulse-section-head">
        <h2 id="pulse-tech-stack-title">{copy.title}</h2>
        <p>{copy.source}</p>
      </header>
      {total > 0 && (
        <div className="pulse-product" data-product="roadmap">
          <p>{progress}</p>
          <div
            className="pulse-progress"
            role="progressbar"
            aria-label={progress}
            aria-valuenow={cutOver}
            aria-valuemax={total}
          >
            {cutOver > 0 && (
              <span data-progress="shipped" style={{ flexGrow: cutOver }} />
            )}
            {cutOver < total && <span style={{ flexGrow: total - cutOver }} />}
          </div>
        </div>
      )}
      {apps.length > 0 ? (
        <details className="pulse-product">
          <summary>{copy.inventory}</summary>
          <div className="pulse-products">
            {apps.map(({ id, status, current, targetUrl }) => (
              <article className="pulse-product" key={id}>
                <header>
                  <h3>{APP_NAMES[id] ?? id}</h3>
                  <span className={`badge ${statusClass[status]}`}>
                    {copy.status[status]}
                  </span>
                </header>
                <dl>
                  <dt className="pulse-quiet">{copy.current}</dt>
                  <dd>
                    <StackDetails copy={copy} stack={current} />
                  </dd>
                  {targetUrl && (
                    <>
                      <dt className="pulse-quiet">{copy.target}</dt>
                      <dd>
                        <StackDetails
                          copy={copy}
                          stack={{ ...TARGET_TECH_STACK, url: targetUrl }}
                        />
                      </dd>
                    </>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </details>
      ) : (
        <p>{copy.unavailable}</p>
      )}
    </section>
  );
}
