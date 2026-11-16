/** EduFest workshop page: the demo class-insights dashboard. */
import { useId } from 'react';
import {
  INSIGHTS_DELIVERABLE,
  INSIGHTS_DEMO,
} from '../../content/workshops/edufest-2026';
import { type EduMessages, type Statuses, WsBadge } from './shared';

/** A mock class-insights dashboard. Every number is sample data, labelled. */
export function WsInsightsDemo({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  const demo = INSIGHTS_DEMO;
  const status = statuses.get(INSIGHTS_DELIVERABLE) ?? 'planned';
  const aiOrder = ['hints', 'full', 'none'] as const;
  const quizMax = Math.max(
    ...demo.quizBuckets.map((bucket) => bucket.learners)
  );
  const tableId = useId();
  return (
    <section className="section" aria-labelledby="ws-insights">
      <header className="section-head">
        <h2 id="ws-insights">{t.insights.title}</h2>
        <p>{t.insights.subtitle}</p>
      </header>
      <div className="ws-card ws-dashboard">
        <p className="ws-demo-flag">
          <span className="ws-demo-pill">{t.insights.demo}</span>
          {t.insights.demoNote} <WsBadge status={status} t={t} />
        </p>
        <dl className="ws-kpis">
          <div>
            <dt>{t.insights.joined}</dt>
            <dd>
              {demo.joined}/{demo.learners}
            </dd>
          </div>
          <div>
            <dt>{t.insights.questions}</dt>
            <dd>{demo.questionsToAi}</dd>
          </div>
          <div>
            <dt>
              {t.insights.average} ({t.insights.outOf})
            </dt>
            <dd>
              {demo.averageQuiz.toLocaleString(undefined, {
                minimumFractionDigits: 1,
              })}
            </dd>
          </div>
        </dl>
        <div className="ws-charts">
          <figure className="ws-chart">
            <figcaption>
              <strong>{t.insights.participationTitle}</strong>
              <span>{t.insights.participationNote}</span>
            </figcaption>
            <div
              className="ws-bars"
              role="img"
              aria-label={`${t.insights.participationTitle}: ${demo.participation.map((value, index) => `${t.insights.learner} ${index + 1} ${value}%`).join(', ')}`}
            >
              {demo.participation.map((value, index) => (
                <span
                  key={index}
                  className="ws-bar"
                  style={{ height: `${value}%` }}
                  title={`${t.insights.learner} ${index + 1}: ${value}%`}
                />
              ))}
            </div>
          </figure>
          <figure className="ws-chart">
            <figcaption>
              <strong>{t.insights.aiTitle}</strong>
            </figcaption>
            <div
              className="ws-stack"
              role="img"
              aria-label={`${t.insights.aiTitle}: ${aiOrder.map((key) => `${t.insights.aiLevels[key]} ${demo.aiHelp[key]}%`).join(', ')}`}
            >
              {aiOrder.map((key) => (
                <span
                  key={key}
                  className={`ws-stack-seg ${key}`}
                  style={{ flexGrow: demo.aiHelp[key] }}
                  title={`${t.insights.aiLevels[key]}: ${demo.aiHelp[key]}%`}
                />
              ))}
            </div>
            <ul className="ws-legend">
              {aiOrder.map((key) => (
                <li key={key}>
                  <span className={`ws-swatch ${key}`} aria-hidden />
                  {t.insights.aiLevels[key]}{' '}
                  <strong>{demo.aiHelp[key]}%</strong>
                </li>
              ))}
            </ul>
          </figure>
          <figure className="ws-chart">
            <figcaption>
              <strong>{t.insights.quizTitle}</strong>
              <span>{t.insights.quizNote}</span>
            </figcaption>
            <ul className="ws-hbars">
              {demo.quizBuckets.map((bucket) => (
                <li
                  key={bucket.range}
                  title={`${bucket.range}: ${bucket.learners} ${t.insights.learnersWord}`}
                >
                  <span className="ws-hbar-label">{bucket.range}</span>
                  <span className="ws-hbar-track">
                    <span
                      className="ws-hbar"
                      style={{ width: `${(bucket.learners / quizMax) * 100}%` }}
                    />
                  </span>
                  <span className="ws-hbar-value">{bucket.learners}</span>
                </li>
              ))}
            </ul>
          </figure>
          <figure className="ws-chart">
            <figcaption>
              <strong>{t.insights.stuckTitle}</strong>
            </figcaption>
            <ol className="ws-stuck">
              {demo.stickingPoints.map((id) => (
                <li key={id}>{t.insights.stuck[id]}</li>
              ))}
            </ol>
          </figure>
        </div>
        <details className="ws-table">
          <summary aria-controls={tableId}>{t.insights.table}</summary>
          <table id={tableId}>
            <thead>
              <tr>
                <th scope="col">{t.insights.metric}</th>
                <th scope="col">{t.insights.value}</th>
              </tr>
            </thead>
            <tbody>
              {demo.participation.map((value, index) => (
                <tr key={`p${index}`}>
                  <th scope="row">
                    {t.insights.participationTitle} · {t.insights.learner}{' '}
                    {index + 1}
                  </th>
                  <td>{value}%</td>
                </tr>
              ))}
              {aiOrder.map((key) => (
                <tr key={key}>
                  <th scope="row">
                    {t.insights.aiTitle} · {t.insights.aiLevels[key]}
                  </th>
                  <td>{demo.aiHelp[key]}%</td>
                </tr>
              ))}
              {demo.quizBuckets.map((bucket) => (
                <tr key={bucket.range}>
                  <th scope="row">
                    {t.insights.quizTitle} · {bucket.range}
                  </th>
                  <td>
                    {bucket.learners} {t.insights.learnersWord}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
