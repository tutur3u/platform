'use client';

import { Gamepad2, Play } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';

export function GamePanel({ onClose }: MeetToolPanelProps) {
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);

  const startRound = () => {
    setRound((current) => current + 1);
    setScore((current) => current + 10);
  };

  return (
    <LiveActivityPanelFrame title="Prep game" onClose={onClose}>
      <div className="grid gap-3 rounded-lg border border-border p-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Gamepad2 className="size-4 text-muted-foreground" />
          Round {round}
        </p>
        <p className="text-muted-foreground">Score {score}</p>
        <Button size="sm" onClick={startRound}>
          <Play className="size-4" />
          Start round
        </Button>
      </div>
    </LiveActivityPanelFrame>
  );
}