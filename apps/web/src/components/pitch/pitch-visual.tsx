'use client';

import styles from './pitch.module.css';
import { PitchCommerce } from './pitch-commerce';
import type { PitchCopy, SlideId } from './pitch-model';

export function PitchVisual({ id, copy }: { id: SlideId; copy: PitchCopy }) {
  if (id === 'pricing' || id === 'calculator')
    return <PitchCommerce id={id} copy={copy} />;
  if (id === 'ai')
    return (
      <div className={styles.bars}>
        <span className={styles.label}>{copy.credits}</span>
        {copy.creditValues.map((value, index) => (
          <div key={value}>
            <div className={styles.row}>
              <span>{[copy.free, copy.plus, copy.pro][index]}</span>
              <strong>{value}</strong>
            </div>
            <div className={styles.track}>
              <div
                style={{
                  width: `${(([1000, 10000, 30000][index] ?? 0) / 30000) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  if (id === 'opening' || id === 'closing')
    return (
      <div className={styles.orbit} aria-hidden="true">
        <div className={styles.orbitRing} />
        <div className={styles.orbitRing} />
        <div className={styles.wordmark}>
          tu<span>tur</span>uuu
        </div>
        {['Tasks', 'AI', 'Drive', 'Learn'].map((name, i) => (
          <span
            key={name}
            className={styles.orbitLabel}
            style={{ '--i': i } as React.CSSProperties}
          >
            {name}
          </span>
        ))}
      </div>
    );
  const items =
    id === 'problem'
      ? copy.friction
      : id === 'platform'
        ? copy.families
        : id === 'workflow'
          ? copy.stages
          : id === 'audience'
            ? copy.people
            : id === 'roadmap'
              ? copy.roadmap
              : id === 'business'
                ? copy.metrics
                : copy.principles;
  return (
    <div className={styles.tiles}>
      {items.map((item, index) => (
        <div className={styles.tile} key={item}>
          <span className={styles.tileNumber}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3>{item}</h3>
          {id === 'platform' && <p>{copy.products[index]}</p>}
          <div
            className={styles.tileLine}
            style={{ width: `${40 + index * 20}%` }}
          />
        </div>
      ))}
    </div>
  );
}
