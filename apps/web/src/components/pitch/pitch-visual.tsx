'use client';

import { useState } from 'react';
import styles from './pitch.module.css';
import {
  type PitchCopy,
  PROPOSED_PRICES,
  type SlideId,
  subscriptionEstimate,
} from './pitch-model';

export function PitchVisual({ id, copy }: { id: SlideId; copy: PitchCopy }) {
  const [seats, setSeats] = useState(10);
  const [annual, setAnnual] = useState(false);
  const totals = subscriptionEstimate(seats, annual);
  if (id === 'calculator')
    return (
      <div className={styles.calculator}>
        <div className={styles.row}>
          <label htmlFor="pitch-seats">{copy.members}</label>
          <output htmlFor="pitch-seats" className={styles.number}>
            {seats}
          </output>
        </div>
        <input
          id="pitch-seats"
          type="range"
          min={1}
          max={100}
          value={seats}
          onChange={(event) => setSeats(Number(event.target.value))}
        />
        <div className={styles.row}>
          <button
            type="button"
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
          >
            {copy.monthly}
          </button>
          <button
            type="button"
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
          >
            {copy.annual}
          </button>
        </div>
        <div aria-live="polite" className={styles.bars}>
          {(['plus', 'pro'] as const).map((plan) => (
            <div key={plan}>
              <div className={styles.row}>
                <span>{copy[plan]}</span>
                <strong>
                  ${totals[plan].toLocaleString('en-US')}{' '}
                  <small>{annual ? copy.perYear : copy.perMonth}</small>
                </strong>
              </div>
              <div className={styles.track}>
                <div
                  style={{
                    width: `${(totals[plan] / (100 * PROPOSED_PRICES.pro[annual ? 'annual' : 'monthly'])) * 100}%`,
                  }}
                />
              </div>
              {annual && (
                <small>
                  ${(totals[plan] / 12).toFixed(2)} {copy.equivalent}
                </small>
              )}
            </div>
          ))}
        </div>
        <small>{copy.estimate}</small>
      </div>
    );
  if (id === 'pricing')
    return (
      <div className={styles.plans}>
        {(['free', 'plus', 'pro', 'enterprise'] as const).map((plan, index) => (
          <div key={plan} className={styles.plan}>
            <span>{copy[plan]}</span>
            <strong>
              {plan === 'enterprise'
                ? copy.custom
                : `$${plan === 'free' ? 0 : PROPOSED_PRICES[plan].monthly}`}
            </strong>
            <small>
              {plan === 'enterprise'
                ? copy.contract
                : `${copy.seat} / ${copy.perMonth}`}
            </small>
            <small>{copy.planDetails[index]}</small>
            <p>
              {[copy.core, copy.capacity, copy.advanced, copy.contract][index]}
            </p>
            {(plan === 'plus' || plan === 'pro') && (
              <small>
                ${PROPOSED_PRICES[plan].annual} / {copy.perYear}
              </small>
            )}
          </div>
        ))}
      </div>
    );
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
