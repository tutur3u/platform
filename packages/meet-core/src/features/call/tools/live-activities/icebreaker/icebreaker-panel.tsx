'use client';

import { Hand, Shuffle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';

const PROMPTS = [
  'Share a tool that saves you time each week.',
  'What is one lesson from your last project?',
  'Which topic should this meeting prioritize?',
] as const;

export function IcebreakerPanel({ onClose }: MeetToolPanelProps) {
  const [index, setIndex] = useState(0);
  const prompt = PROMPTS[index] ?? PROMPTS[0];

  const shuffle = () => {
    setIndex((current) => (current + 1) % PROMPTS.length);
  };

  return (
    <LiveActivityPanelFrame title="Icebreaker" onClose={onClose}>
      <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Hand className="size-4 text-muted-foreground" />
          Prompt
        </p>
        <p className="wrap-break-word">{prompt}</p>
        <Button size="sm" variant="outline" onClick={shuffle}>
          <Shuffle className="size-4" />
          New prompt
        </Button>
      </div>
    </LiveActivityPanelFrame>
  );
}