'use client';

import { useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Splits a display string such as "10,000+", "3 hrs" or "47%" into the number
 * to animate and the text that brackets it, so the surrounding copy is
 * preserved exactly as translated.
 */
function parse(value: string) {
  const match = value.match(/[\d,.]+/);
  if (!match) return null;

  const raw = match[0];
  const numeric = Number.parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return null;

  return {
    numeric,
    prefix: value.slice(0, match.index ?? 0),
    suffix: value.slice((match.index ?? 0) + raw.length),
    decimals: raw.includes('.') ? (raw.split('.')[1]?.length ?? 0) : 0,
    grouped: raw.includes(','),
  };
}

const EASE_OUT_EXPO = (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * Counts a stat up to its final value the first time it scrolls into view.
 *
 * Falls back to the literal string when the value has no number in it, and
 * renders the final value immediately under reduced-motion.
 */
export function CountUp({
  value,
  duration = 1600,
  className,
}: {
  value: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();
  const parsed = useMemo(() => parse(value), [value]);
  const [display, setDisplay] = useState(() =>
    parsed ? `${parsed.prefix}0${parsed.suffix}` : value
  );

  useEffect(() => {
    if (!(parsed && inView)) return;
    if (reduced) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    let start: number | null = null;

    const format = (n: number) => {
      const fixed = n.toFixed(parsed.decimals);
      const grouped = parsed.grouped
        ? Number(fixed).toLocaleString('en-US', {
            minimumFractionDigits: parsed.decimals,
            maximumFractionDigits: parsed.decimals,
          })
        : fixed;
      return `${parsed.prefix}${grouped}${parsed.suffix}`;
    };

    const tick = (timestamp: number) => {
      start ??= timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setDisplay(format(parsed.numeric * EASE_OUT_EXPO(progress)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduced, parsed]);

  return (
    <span className={className} ref={ref}>
      {parsed ? display : value}
    </span>
  );
}
