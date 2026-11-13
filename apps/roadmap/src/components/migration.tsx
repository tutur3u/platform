import { APP_NAMES } from '../live/host-probe';
import {
  type HostingSnapshot,
  hostingAsOf,
  MIGRATION_STATES,
  migrationSummary,
} from '../live/hosting';
import { formatDate, type Lang, type Messages, SectionHead } from './shared';

const NAMES: Record<string, string> = { ...APP_NAMES, storefront: 'Store' };

function hostOf(url: string) {
  return url.replace(/^https:\/\//, '');
}

/**
 * Each app's move from its subdomain to its tuturuuu.com path. The app list
 * and paths are the repo's base-path registry; each state was observed when
 * this page was built (see live/hosting.ts).
 */
export function MigrationSection({
  t,
  lang,
  hosting,
}: {
  t: Messages;
  lang: Lang;
  hosting: HostingSnapshot;
}) {
  const { entries, counts, total } = migrationSummary(
    hosting,
    hosting.registry
  );
  if (!total) return null;
  const asOf = hostingAsOf(hosting);
  const progress = t.migration.progress
    .replace('{done}', String(counts.done))
    .replace('{total}', String(total));
  return (
    <section className="section migration" aria-labelledby="migration-title">
      <SectionHead
        id="migration-title"
        title={t.migration.title}
        subtitle={t.migration.subtitle}
      />
      <div className="migration-summary">
        <p className="migration-count">
          <b>{progress}</b>
          {counts.in_progress ? (
            <span>
              {' · '}
              {t.migration.inProgressCount.replace(
                '{n}',
                String(counts.in_progress)
              )}
            </span>
          ) : null}
        </p>
        <div
          className="migration-bar"
          role="img"
          aria-label={MIGRATION_STATES.map(
            (state) => `${t.migration.states[state]} ${counts[state]}`
          ).join(', ')}
        >
          {MIGRATION_STATES.map((state) =>
            counts[state] ? (
              <span
                key={state}
                className={`migration-seg ${state}`}
                style={{ width: `${(counts[state] / total) * 100}%` }}
              />
            ) : null
          )}
        </div>
        <ul className="migration-legend">
          {MIGRATION_STATES.map((state) => (
            <li key={state}>
              <span className={`migration-dot ${state}`} aria-hidden />
              {t.migration.states[state]} <b>{counts[state]}</b>
            </li>
          ))}
        </ul>
        {asOf ? (
          <p className="hint">
            {t.migration.asOf}{' '}
            <time dateTime={asOf}>{formatDate(asOf, lang, true)} (UTC+7)</time>
          </p>
        ) : null}
      </div>
      <ul className="migration-list" aria-label={t.migration.list}>
        {entries.map((entry) => (
          <li key={entry.app} className={`migration-item ${entry.state}`}>
            <span className="migration-name">
              {NAMES[entry.app] ?? entry.app}
            </span>
            <span className="migration-path">
              <span className="sr-only">{t.migration.from} </span>
              <code>{hostOf(entry.from)}</code>
              <span aria-hidden> → </span>
              <span className="sr-only"> {t.migration.to} </span>
              <code>{hostOf(entry.to)}</code>
            </span>
            <span className={`migration-state ${entry.state}`}>
              {t.migration.states[entry.state]}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">{t.migration.method}</p>
    </section>
  );
}
