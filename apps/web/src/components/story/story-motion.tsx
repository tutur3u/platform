'use client';

import { Pause, Waves } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { createContext, type ReactNode, useContext, useState } from 'react';
import styles from './story-motion.module.css';

const MotionContext = createContext({ paused: false, toggle: () => {} });

export function StoryMotion({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  return (
    <MotionContext.Provider
      value={{ paused, toggle: () => setPaused((value) => !value) }}
    >
      <div className={styles.stage} data-motion={paused ? 'paused' : 'playing'}>
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
