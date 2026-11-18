import {
  fill,
  formatNumber,
  shortDay,
} from '@tuturuuu/roadmap-core/components/insights/format.ts';
import {
  formatDate,
  type Lang,
  type Messages,
} from '@tuturuuu/roadmap-core/components/shared.tsx';
import { REPO_URL } from '@tuturuuu/roadmap-core/live/model.ts';
import type { CSSProperties } from 'react';
import type { RoadmapSnapshot } from '../roadmap-snapshot';
import { calendarDays, PRODUCT_KEYS } from './pulse-data';
import { ProductIcon } from './pulse-icons';

const environments = ['production', 'database', 'staging'] as const;

export function ReleaseTrain({
  copy,
  lang,
  snapshot,
}: {
  copy: Messages['pulseRoadmap'];
  lang: Lang;
  snapshot: RoadmapSnapshot | null;
}) {
  const deployments = [...(snapshot?.deploys ?? [])].sort((a, b) =>
    b.at.localeCompare(a.at)
  );
  const slot = new Map(deployments.map((row, index) => [row.sha, index + 1]));
  return (
    <section className="pulse-section" aria-labelledby="pulse-train-title">
      <header className="pulse-section-head">
        <div>
          <h2 id="pulse-train-title">{copy.train}</h2>
          <p>{copy.trainSubtitle}</p>
        </div>
      </header>
      <div
        className="pulse-train"
        style={
          {
            '--pulse-release-slots': Math.max(1, deployments.length),
          } as CSSProperties
        }
      >
        {deployments.length === 0 && <p>{copy.emptyTrain}</p>}
        {environments.map((environment) => {
          const rows = deployments.filter(({ env }) => env === environment);
          if (rows.length === 0) return null;
          return (
            <div
              key={environment}
              className="pulse-lane"
              data-env={environment}
            >
              <h3>{copy.environments[environment]}</h3>
              <ol aria-label={copy.environments[environment]}>
                {rows.map(({ sha, at, apps }) => (
                  <li
                    key={sha}
                    style={
                      { '--pulse-release-slot': slot.get(sha) } as CSSProperties
                    }
                    data-current={sha === snapshot?.productionSha || undefined}
                  >
                    <a href={`${REPO_URL}/commit/${sha}`}>
                      <code>{sha.slice(0, 7)}</code>
                      <time dateTime={at}>{formatDate(at, lang, true)}</time>
                      <span>
                        {fill(copy.appCount, {
                          count: formatNumber(apps ?? 1, lang),
                        })}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ProductHeatmap({
  copy,
  lang,
  snapshot,
}: {
  copy: Messages['pulseRoadmap'];
  lang: Lang;
  snapshot: RoadmapSnapshot | null;
}) {
  const dates = snapshot ? calendarDays(snapshot.generatedAt) : [];
  const byKey = new Map(
    snapshot?.products.map((product) => [product.key, product]) ?? []
  );
  const rows = PRODUCT_KEYS.flatMap((key) => {
    const product = byKey.get(key);
    return product ? [{ ...product, key }] : [];
  }).sort((a, b) => b.commits30d - a.commits30d);
  return (
    <section className="pulse-section" aria-labelledby="pulse-heat-title">
      <header className="pulse-section-head">
        <div>
          <h2 id="pulse-heat-title">{copy.heat}</h2>
          <p>{copy.heatSubtitle}</p>
        </div>
      </header>
      <div className="pulse-heat">
        {rows.length === 0 ? (
          <p>{copy.unavailable}</p>
        ) : (
          <>
            <table aria-labelledby="pulse-heat-title">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">{copy.productsTitle}</span>
                  </th>
                  {dates.map((day, index) => (
                    <th
                      key={day}
                      scope="col"
                      data-extended={index < 16 || undefined}
                    >
                      <span className="sr-only">{shortDay(day, lang)}</span>
                      {(index === 0 || index === 16 || index === 29) && (
                        <span aria-hidden="true">{day.slice(-2)}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((product) => {
                  const max = Math.max(1, ...product.daily);
                  return (
                    <tr key={product.key} data-product={product.key}>
                      <th scope="row">
                        <ProductIcon product={product.key} size={15} />
                        {copy.product[product.key]}
                      </th>
                      {product.daily.map((count, index) => {
                        const level =
                          count === 0 ? 0 : Math.ceil((4 * count) / max);
                        return (
                          <td
                            key={dates[index]}
                            data-extended={index < 16 || undefined}
                          >
                            <span
                              className="pulse-heat-cell"
                              data-level={level}
                              title={`${shortDay(dates[index], lang)} · ${count}`}
                            >
                              <span className="sr-only">{count}</span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="pulse-heat-key" aria-hidden="true">
              {copy.less}
              {[0, 1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  className="pulse-heat-cell"
                  data-level={level}
                />
              ))}
              {copy.more}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
