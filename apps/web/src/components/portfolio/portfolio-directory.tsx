'use client';

import { ArrowUpRight } from '@tuturuuu/icons/lucide';
import { useState } from 'react';
import { pitchTone } from '../pitch/pitch-brand';
import type { PortfolioCopy } from './portfolio';
import styles from './portfolio.module.css';

export interface PortfolioApp {
  slug: string;
  title: string;
  category: string;
  url: string;
  description: string;
}

export function EcosystemDirectory({
  apps,
  copy,
}: {
  apps: PortfolioApp[];
  copy: PortfolioCopy;
}) {
  const [category, setCategory] = useState('all');
  const visible = apps.filter(
    (app) => category === 'all' || app.category === category
  );
  return (
    <div>
      <fieldset className={styles.filters}>
        <legend className={styles.srOnly}>{copy.explore}</legend>
        {[['all', copy.all], ...Object.entries(copy.categories)].map(
          ([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={category === key}
              onClick={() => setCategory(key!)}
            >
              {label}
              <span>
                {key === 'all'
                  ? apps.length
                  : apps.filter((app) => app.category === key).length}
              </span>
            </button>
          )
        )}
      </fieldset>
      <p className={styles.srOnly} aria-live="polite">
        {category === 'all'
          ? copy.all
          : copy.categories[category as keyof typeof copy.categories]}
        : {visible.length}
      </p>
      <div className={styles.directory}>
        {visible.map((app) => (
          <a
            href={app.url}
            key={app.slug}
            style={pitchTone(
              Object.keys(copy.categories).indexOf(app.category)
            )}
          >
            <div className={styles.appMonogram}>
              {app.title.slice(0, 2)}
              <span />
            </div>
            <div>
              <h3>{app.title}</h3>
              <p>{app.description}</p>
            </div>
            <ArrowUpRight size={17} />
          </a>
        ))}
      </div>
    </div>
  );
}
