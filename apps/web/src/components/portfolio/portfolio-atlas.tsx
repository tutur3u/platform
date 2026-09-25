'use client';

import { ArrowRight } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import { ProductMark } from '../capabilities/product-mark';
import { pitchTone } from '../pitch/pitch-brand';
import type { PortfolioCopy } from './portfolio';
import type { PortfolioApp } from './portfolio-directory';
import styles from './portfolio-starward.module.css';

const flowProducts = ['Mail', 'Meet', 'Tasks', 'Calendar', 'Drive', 'Mira'];
export function PortfolioAtlas({
  copy,
  apps,
}: {
  copy: PortfolioCopy;
  apps: PortfolioApp[];
}) {
  const [step, setStep] = useState(0);
  const categories = Object.entries(copy.categories).map(([id, label]) => ({
    id,
    label,
    count: apps.filter((app) => app.category === id).length,
  }));
  const max = Math.max(1, ...categories.map((c) => c.count));
  return (
    <section className={styles.atlas}>
      <header>
        <p className={styles.eyebrow}>{copy.atlas.eyebrow}</p>
        <h2>{copy.atlas.title}</h2>
        <p>{copy.atlas.body}</p>
      </header>
      <div className={styles.catalogChart}>
        <div className={styles.catalogTotal}>
          <strong>{apps.length.toString().padStart(2, '0')}</strong>
          <span>{copy.atlas.count}</span>
          <div className={styles.catalogDots} aria-hidden="true">
            {apps.map((app, i) => (
              <i key={app.slug} style={pitchTone(i)} />
            ))}
          </div>
        </div>
        <figure>
          <figcaption>{copy.atlas.chart}</figcaption>
          {categories.map((category, i) => (
            <div
              className={styles.barRow}
              key={category.id}
              style={pitchTone(i)}
            >
              <span>{category.label}</span>
              <div className={styles.barTrack}>
                <i
                  data-grow
                  style={{ width: `${(category.count / max) * 100}%` }}
                />
              </div>
              <strong>{category.count}</strong>
            </div>
          ))}
        </figure>
      </div>
      <div className={styles.flow}>
        <header>
          <h3>{copy.atlas.flowTitle}</h3>
          <p>{copy.atlas.flowBody}</p>
        </header>
        <fieldset
          className={styles.flowSteps}
          aria-label={copy.atlas.flowTitle}
        >
          {flowProducts.map((product, i) => (
            <Button
              variant="ghost"
              type="button"
              key={product}
              aria-pressed={step === i}
              aria-controls="portfolio-flow-detail"
              onClick={() => setStep(i)}
              style={pitchTone(i)}
            >
              <span>0{i + 1}</span>
              <ProductMark product={product} size={32} />
              <strong>{product}</strong>
              {i < flowProducts.length - 1 && (
                <ArrowRight size={15} aria-hidden="true" />
              )}
            </Button>
          ))}
        </fieldset>
        <div id="portfolio-flow-detail" aria-live="polite">
          <div className={styles.flowDetail} key={step} data-story-panel>
            <span>
              0{step + 1} / {flowProducts[step]}
            </span>
            <h4>{copy.atlas.steps[step]!.title}</h4>
            <p>{copy.atlas.steps[step]!.body}</p>
          </div>
        </div>
        <small>{copy.atlas.flowNote}</small>
      </div>
    </section>
  );
}
