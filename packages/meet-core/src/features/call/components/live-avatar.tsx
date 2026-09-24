'use client';
import { useSyncExternalStore } from 'react';
import {
  playbackSnapshot,
  silentSnapshot,
  subscribePlaybackMeter,
} from '../../live-assistant/playback-meter';

/** Lightweight audio-driven avatar; no model files, camera capture, or face tracking. */
export function LiveAvatar({ size = 80 }: { size?: number }) {
  const level = useSyncExternalStore(
    subscribePlaybackMeter,
    playbackSnapshot,
    silentSnapshot
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className="shrink-0 text-primary"
    >
      <circle cx="50" cy="50" r="47" fill="currentColor" opacity="0.08" />
      <path
        d="M22 87 Q25 66 50 67 Q75 66 78 87"
        fill="currentColor"
        opacity="0.3"
      />
      <ellipse
        cx="50"
        cy="42"
        rx="27"
        ry="31"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M25 37 Q20 6 51 11 Q78 10 77 38 Q61 27 51 22 Q40 35 25 37"
        fill="currentColor"
        opacity="0.8"
      />
      <circle cx="39" cy="43" r="2.5" fill="currentColor" />
      <circle cx="61" cy="43" r="2.5" fill="currentColor" />
      <path
        d="M48 47 L46 53 L51 53"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <ellipse
        cx="50"
        cy="61"
        rx={7 + level * 2}
        ry={1.2 + level * 7}
        fill="currentColor"
      />
    </svg>
  );
}
