'use client';
import { usePublicWorkspacePrices } from '@tuturuuu/ui/public-workspace-prices';
import { useState } from 'react';
import styles from './pitch.module.css';
import { type PitchCopy, subscriptionEstimate } from './pitch-model';
export function PitchCommerce({
  id,
  copy,
}: {
  id: 'pricing' | 'calculator';
  copy: PitchCopy;
}) {
  const [seats, setSeats] = useState(10);
  const [annual, setAnnual] = useState(false);
  const { data, isPending, isError } = usePublicWorkspacePrices();
  if (!data || isError)
    return (
      <p role="status">
        {isPending ? copy.pricesLoading : copy.pricesUnavailable}
      </p>
    );
  const prices = {
    plus: {
      monthly: data.prices.plus.monthly / 100,
      annual: data.prices.plus.annual / 100,
    },
    pro: {
      monthly: data.prices.pro.monthly / 100,
      annual: data.prices.pro.annual / 100,
    },
  };
  const totals = subscriptionEstimate(seats, annual, prices);
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
                    width: `${(totals[plan] / (100 * prices.pro[annual ? 'annual' : 'monthly'])) * 100}%`,
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
                : `$${plan === 'free' ? 0 : prices[plan].monthly}`}
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
                ${prices[plan].annual} / {copy.perYear}
              </small>
            )}
          </div>
        ))}
      </div>
    );
  return null;
}
