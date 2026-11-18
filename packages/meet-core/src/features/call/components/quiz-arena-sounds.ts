'use client';

import type { QuizArenaFullView } from '@tuturuuu/realtime/meet/room-quiz-arena';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  playBuzzCue,
  playCorrectCue,
  playFinalRoundCue,
  playWrongCue,
} from '../lib/quiz-arena-sfx';

const STORAGE_KEY = 'meet-quiz-arena-sfx';

function readPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Plays cues on state transitions the player sees: their own reveal result
 * and the start of the final round. Cues never replay for a tile already
 * revealed when the panel opened.
 */
export function useQuizArenaSounds(view: QuizArenaFullView | undefined) {
  const [enabled, setEnabledState] = useState(readPreference);
  const seen = useRef<{
    epoch: string;
    revealed: Set<string>;
    phase: string;
  } | null>(null);
  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
    } catch {
      // Storage can be unavailable; the toggle still applies to this session.
    }
  }, []);

  useEffect(() => {
    if (!view) return;
    const tiles = view.finalTile ? [...view.tiles, view.finalTile] : view.tiles;
    const revealed = new Set(
      tiles.filter(({ status }) => status === 'revealed').map(({ id }) => id)
    );
    const previous = seen.current;
    seen.current = { epoch: view.epoch, revealed, phase: view.meta.phase };
    if (!previous || previous.epoch !== view.epoch) return;
    if (view.meta.phase === 'final_wager' && previous.phase !== 'final_wager')
      playFinalRoundCue(enabled);
    for (const tile of tiles) {
      if (!revealed.has(tile.id) || previous.revealed.has(tile.id)) continue;
      if (tile.myResult?.correct === true) playCorrectCue(enabled);
      else if (tile.myResult?.correct === false) playWrongCue(enabled);
    }
  }, [enabled, view]);

  return {
    enabled,
    setEnabled,
    buzz: () => playBuzzCue(enabled),
  };
}
