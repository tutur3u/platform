import { REPO_URL } from '../live/model';
import { statuses } from '../live/status';
import type { RoadmapView } from '../view-model';
import {
  formatDate,
  type Lang,
  type Messages,
  SectionHead,
  StatusBadge,
} from './shared';

export function HostingSection({
  t,
  lang,
  view,
  main,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  main: { sha: string; at: string } | null;
}) {
  return (
    <section className="section" aria-labelledby="hosting-title">
      <SectionHead
        id="hosting-title"
        title={t.hosting.title}
        subtitle={t.hosting.subtitle}
      />
      {main ? (
        <p className="main-commit">
          {t.hosting.main}:{' '}
          <a href={`${REPO_URL}/commit/${main.sha}`}>
            <code>{main.sha.slice(0, 7)}</code>
          </a>{' '}
          · {formatDate(main.at, lang, true)}
        </p>
      ) : null}
      <ul className="hosts">
        {view.hosts.map((host) => (
          <li key={host.app} className={host.platform}>
            <div className="host-head">
              <b>{host.name}</b>
              <span className={`platform ${host.platform}`}>
                {t.hosting[host.platform === 'store' ? 'store' : host.platform]}
              </span>
            </div>
            <p className="meta">
              {host.commit ? (
                <>
                  <a href={`${REPO_URL}/commit/${host.commit}`}>
                    <code>{host.commit.slice(0, 7)}</code>
                  </a>
                  {host.behindBy === 0 ? (
                    <span className="ok">{t.hosting.upToDate}</span>
                  ) : host.behindBy ? (
                    <span>
                      {host.behindBy} {t.hosting.commits} {t.hosting.behind}
                    </span>
                  ) : null}
                </>
              ) : (
                <span>{t.hosting.noCommit}</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Method({ t }: { t: Messages }) {
  return (
    <section className="section method" aria-labelledby="method-title">
      <h2 id="method-title">{t.method.title}</h2>
      <dl>
        {statuses.map((s) => (
          <div key={s}>
            <dt>
              <StatusBadge status={s} t={t} />
            </dt>
            <dd>{t.method[s]}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">{t.method.sources}</p>
    </section>
  );
}
