import { useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  end: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
}

export default function AnimatedCounter({
  end,
  duration = 2,
  suffix = '',
  prefix = '',
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (isInView && !hasAnimated) {
      let startTimestamp: number;
      const step = (timestamp: number) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min(
          (timestamp - startTimestamp) / (duration * 1000),
          1
        );

        setCount(Math.floor(progress * end));

        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          setHasAnimated(true);
        }
      };

      window.requestAnimationFrame(step);
    }
  }, [isInView, end, duration, hasAnimated]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}
