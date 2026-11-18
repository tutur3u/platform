import { GitCommitHorizontal } from '@tuturuuu/icons';

import { formatNumber } from '@tuturuuu/roadmap-core/components/insights/format.ts';
import type {
  Lang,
  Messages,
} from '@tuturuuu/roadmap-core/components/shared.tsx';
import { REPO_URL } from '@tuturuuu/roadmap-core/live/model.ts';
import type { RoadmapView } from '@tuturuuu/roadmap-core/view-model.ts';
import { useState } from 'react';
import {
  PRODUCT_KEYS,
  type Product,
  type ProductKey,
  productProgress,
} from './pulse-data';
import { PulseBars } from './pulse-hero';
import { ProductIcon } from './pulse-icons';

export function PulseProducts({
  t,
  lang,
  view,
  data,
}: {
  t: Messages;
  lang: Lang;
  view: RoadmapView;
  data: readonly Product[];
}) {
  const [range, setRange] = useState<7 | 30>(7);
  const copy = t.pulseRoadmap;
  const byKey = new Map(data.map((product) => [product.key, product]));
  const count = (product?: Product) =>
    range === 7 ? product?.commits7d : product?.commits30d;
  const sorted = PRODUCT_KEYS.map((key) => ({
    key,
    activity: byKey.get(key),
  })).sort((a, b) => (count(b.activity) ?? 0) - (count(a.activity) ?? 0));
  return (
    <section className="pulse-section" aria-labelledby="pulse-products-title">
      <header className="pulse-section-head">
        <div>
          <h2 id="pulse-products-title">{copy.productsTitle}</h2>
          <p>{copy.productsSubtitle}</p>
        </div>
        <div className="pulse-period" role="group" aria-label={copy.range}>
          <button
            type="button"
            aria-pressed={range === 7}
            onClick={() => setRange(7)}
          >
            {copy.week}
          </button>
          <button
            type="button"
            aria-pressed={range === 30}
            onClick={() => setRange(30)}
          >
            {copy.month}
          </button>
        </div>
      </header>
      <div className="pulse-products">
        {sorted.slice(0, 12).map(({ key, activity }, index) => (
          <ProductCard
            key={key}
            product={key}
            compactOnMobile={index >= 4}
            activity={activity}
            count={count(activity)}
            compareWeek={range === 7}
            progress={productProgress(view, key)}
            lang={lang}
            copy={copy}
          />
        ))}
      </div>
      <ul className="pulse-compact">
        {sorted.slice(4).map(({ key, activity }, index) => (
          <li
            key={key}
            data-product={key}
            data-mobile-only={index < 8 || undefined}
          >
            <a href={`#track-${key === 'mind' ? 'mastermind' : key}`}>
              <span className="pulse-product-icon">
                <ProductIcon product={key} size={17} />
              </span>
              <span>{copy.product[key]}</span>
              {activity && (
                <PulseBars
                  daily={activity.daily.slice(-14)}
                  label={copy.commits}
                />
              )}
              <strong>
                {activity ? formatNumber(count(activity) ?? 0, lang) : '—'}
              </strong>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductCard({
  product,
  compactOnMobile,
  activity,
  count,
  compareWeek,
  progress,
  lang,
  copy,
}: {
  product: ProductKey;
  compactOnMobile: boolean;
  activity?: Product;
  count?: number;
  compareWeek: boolean;
  progress: ReturnType<typeof productProgress>;
  lang: Lang;
  copy: Messages['pulseRoadmap'];
}) {
  const recent = activity?.recent[0];
  const delta = activity ? activity.commits7d - activity.commits7dPrev : 0;
  const statuses = [
    { key: 'shipped', count: progress.shipped, label: copy.shipped },
    { key: 'active', count: progress.inProgress, label: copy.inProgress },
    { key: 'next', count: progress.next, label: copy.next },
  ];
  return (
    <article
      className="pulse-product"
      data-product={product}
      data-compact-mobile={compactOnMobile || undefined}
    >
      <header>
        <span className="pulse-product-icon">
          <ProductIcon product={product} />
        </span>
        <h3>{copy.product[product]}</h3>
        <div className="pulse-product-count">
          <strong>
            {count === undefined ? '—' : formatNumber(count, lang)}
          </strong>
          <span>
            {compareWeek && delta
              ? `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta), lang)}`
              : copy.commits}
          </span>
        </div>
      </header>
      {activity && <PulseBars daily={activity.daily} label={copy.series} />}
      <div className="pulse-progress" aria-hidden="true">
        {statuses
          .filter((status) => status.count > 0)
          .map((status) => (
            <span
              key={status.key}
              data-progress={status.key}
              style={{ flexGrow: status.count }}
            />
          ))}
      </div>
      <ul className="pulse-progress-labels">
        {statuses.map((status) => (
          <li key={status.key} data-progress={status.key}>
            <b>{status.count}</b> {status.label}
          </li>
        ))}
      </ul>
      {recent ? (
        <a className="pulse-commit" href={`${REPO_URL}/commit/${recent.sha}`}>
          <GitCommitHorizontal aria-hidden="true" size={16} />
          <span lang="en">{recent.subject}</span>
          <code>{recent.sha.slice(0, 7)}</code>
          {recent.live && <span className="pulse-live">{copy.live}</span>}
        </a>
      ) : (
        <p className="pulse-quiet">{copy.quiet}</p>
      )}
    </article>
  );
}
