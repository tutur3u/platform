'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { CallState } from '../lib/call-state';
import { REACTION_GLYPHS } from './call-extras';
export function ReactionOverlay({ state }: { state: CallState }) {
  const t = useTranslations('meet.call');
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const active = state.reactions
    .filter((reaction) => now - Date.parse(reaction.createdAt) < 4500)
    .slice(-6);
  return (
    <div
      className="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex flex-wrap justify-center gap-2"
      aria-live="polite"
    >
      {active.map((entry) => (
        <div
          key={`${entry.userId}:${entry.createdAt}`}
          className="motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg motion-safe:animate-in"
        >
          <span
            className="text-2xl"
            role="img"
            aria-label={t(`reaction_${entry.reaction}`)}
          >
            {REACTION_GLYPHS[entry.reaction]}
          </span>
          <span className="max-w-28 truncate text-xs">
            {state.participants[entry.userId]?.displayName}
          </span>
        </div>
      ))}
    </div>
  );
}
