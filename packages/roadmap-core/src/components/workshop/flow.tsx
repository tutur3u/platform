/** EduFest workshop page: the classroom flow and the readiness summary. */
import type en from '../../../messages/edufest-2026.en.json';
import {
  CLASSROOM_FLOW,
  USE_CASES,
  type WorkshopStatus,
} from '../../content/workshops/edufest-2026';
import {
  type EduMessages,
  type Statuses,
  statusOf,
  UseCaseRow,
  STATUS_ICON,
} from './shared';

export function WsFlow({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  return (
    <section className="section" aria-labelledby="ws-flow">
      <header className="section-head">
        <h2 id="ws-flow">{t.flow.title}</h2>
        <p>{t.flow.subtitle}</p>
      </header>
      <ol className="ws-flow">
        {CLASSROOM_FLOW.map((stage, position) => (
          <li key={stage.id} className="ws-card">
            <h3>
              <span className="ws-num" aria-hidden>
                {position + 1}
              </span>
              {t.flow.stages[stage.id as keyof EduMessages['flow']['stages']]}
            </h3>
            <ul className="ws-uses">
              {stage.uses.map((id) => (
                <UseCaseRow key={id} id={id} t={t} statuses={statuses} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Real counts across this page's capabilities, from the live roadmap data. */
export function WsReadiness({
  t,
  statuses,
  checkedAt,
  lang,
}: {
  t: EduMessages;
  statuses: Statuses;
  checkedAt: string;
  lang: 'en' | 'vi';
}) {
  const counts = { live: 0, in_progress: 0, planned: 0 };
  for (const item of USE_CASES) counts[statusOf(item, statuses)] += 1;
  const total = USE_CASES.length;
  const order: WorkshopStatus[] = ['live', 'in_progress', 'planned'];
  const when = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(checkedAt));
  return (
    <section className="section" aria-labelledby="ws-readiness">
      <header className="section-head">
        <h2 id="ws-readiness">{t.readiness.title}</h2>
        <p>{t.readiness.subtitle}</p>
      </header>
      <div className="ws-card ws-readiness">
        <dl className="ws-tiles">
          {order.map((status) => {
            const Icon = STATUS_ICON[status];
            return (
              <div key={status} className={`ws-tile ${status}`}>
                <dt>
                  <Icon size={15} aria-hidden />
                  {t.status[status]}
                </dt>
                <dd>{counts[status]}</dd>
              </div>
            );
          })}
        </dl>
        <div
          className="ws-segbar"
          role="img"
          aria-label={`${t.readiness.legend}: ${order
            .map((status) => `${t.status[status]} ${counts[status]}`)
            .join(', ')}; ${total} ${t.readiness.total}`}
        >
          {order.map((status) =>
            counts[status] ? (
              <span
                key={status}
                className={`ws-seg ${status}`}
                style={{ flexGrow: counts[status] }}
                title={`${t.status[status]}: ${counts[status]}/${total}`}
              />
            ) : null
          )}
        </div>
        <p className="ws-source">
          {t.readiness.source} <time dateTime={checkedAt}>{when}</time> ·{' '}
          <a href="/roadmap">{t.tools.roadmap}</a>
        </p>
      </div>
    </section>
  );
}
