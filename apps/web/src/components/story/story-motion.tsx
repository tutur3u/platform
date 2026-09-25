'use client';

import { Pause, Waves } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import styles from './story-motion.module.css';

const MotionContext = createContext({ paused: false, toggle: () => {} });

export function StoryMotion({
  children,
  reveal = false,
}: {
  children: ReactNode;
  reveal?: boolean;
}) {
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const revealed = useRef(new WeakSet<Element>());
  useEffect(() => {
    if (paused || !root.current || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>();
    const stop = () => {
      for (const animation of animations) animation.cancel();
      animations.clear();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target.tagName.toLowerCase() === 'svg') {
            entry.target.setAttribute(
              'data-flow-active',
              String(entry.isIntersecting)
            );
            continue;
          }
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          revealed.current.add(entry.target);
          if (preference.matches || !('animate' in entry.target)) continue;
          const animation = entry.target.animate(
            [
              {
                opacity: 0.35,
                transform: entry.target.hasAttribute('data-grow')
                  ? 'scaleX(0.05)'
                  : 'translateY(28px)',
              },
              {
                opacity: 1,
                transform: entry.target.hasAttribute('data-grow')
                  ? 'scaleX(1)'
                  : 'translateY(0)',
              },
            ],
            { duration: 800, easing: 'cubic-bezier(.16,1,.3,1)' }
          );
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
        }
      },
      { threshold: 0.08 }
    );
    for (const element of root.current.querySelectorAll(
      reveal
        ? 'main > section, [data-reveal], [data-grow], svg:has([data-flow-line])'
        : 'svg:has([data-flow-line])'
    ))
      if (!revealed.current.has(element)) observer.observe(element);
    preference.addEventListener('change', stop);
    window.addEventListener('beforeprint', stop);
    return () => {
      observer.disconnect();
      stop();
      preference.removeEventListener('change', stop);
      window.removeEventListener('beforeprint', stop);
    };
  }, [paused, reveal]);
  return (
    <MotionContext.Provider
      value={{ paused, toggle: () => setPaused(!paused) }}
    >
      <div
        ref={root}
        className={styles.stage}
        data-motion={paused ? 'paused' : 'playing'}
      >
        {children}
      </div>
    </MotionContext.Provider>
  );
}

export function MotionToggle({
  copy,
  floating = false,
}: {
  copy: { pause: string; resume: string };
  floating?: boolean;
}) {
  const { paused, toggle } = useContext(MotionContext);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={floating ? styles.floating : styles.toggle}
      aria-label={paused ? copy.resume : copy.pause}
      title={paused ? copy.resume : copy.pause}
      aria-pressed={paused}
      onClick={toggle}
    >
      {paused ? <Waves size={17} /> : <Pause size={17} />}
    </Button>
  );
}
