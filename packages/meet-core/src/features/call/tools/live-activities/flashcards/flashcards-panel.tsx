'use client';

import { Layers, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';

const DECK = [
  { front: 'Objective', back: 'Align on the sprint goal.' },
  { front: 'Risk', back: 'Name one blocker early.' },
  { front: 'Win', back: 'Share a recent customer signal.' },
] as const;

export function FlashcardsPanel({ onClose }: MeetToolPanelProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = DECK[index] ?? DECK[0];

  const nextCard = () => {
    setFlipped(false);
    setIndex((current) => (current + 1) % DECK.length);
  };

  return (
    <LiveActivityPanelFrame title="Flashcards" onClose={onClose}>
      <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium text-foreground">
          {flipped ? card.back : card.front}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFlipped((value) => !value)}
          >
            <Layers className="size-4" />
            Flip
          </Button>
          <Button size="sm" variant="outline" onClick={nextCard}>
            <RotateCcw className="size-4" />
            Next card
          </Button>
        </div>
      </div>
    </LiveActivityPanelFrame>
  );
}
