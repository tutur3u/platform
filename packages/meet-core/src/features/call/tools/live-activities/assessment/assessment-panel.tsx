'use client';

import { CheckSquare, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useState } from 'react';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';

export function AssessmentPanel({ onClose }: MeetToolPanelProps) {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const addItem = () => {
    const value = draft.trim();
    if (!value) return;
    setItems((current) => [...current, value]);
    setDraft('');
  };

  return (
    <LiveActivityPanelFrame title="Assessment" onClose={onClose}>
      <label className="grid gap-1 text-sm">
        Prompt
        <Input
          aria-label="Assessment prompt"
          maxLength={120}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <Button size="sm" variant="outline" onClick={addItem}>
        <Plus className="size-4" />
        Add item
      </Button>
      <ul className="space-y-2 text-sm">
        {items.map((item, index) => (
          <li
            key={`${index}-${item}`}
            className="flex items-start gap-2 rounded-md border border-border px-3 py-2"
          >
            <CheckSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="wrap-break-word">{item}</span>
          </li>
        ))}
      </ul>
    </LiveActivityPanelFrame>
  );
}
