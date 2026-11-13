'use client';

import { useState } from 'react';
import { ExperimentalFeatureDialog } from './experimental-feature-dialog';
import { SmartSchedulePreviewPanel } from './smart-schedule-preview-panel';

export type SmartScheduleStep = 'idle' | 'confirming' | 'previewing';

/** The experimental warning shows once per mount, before the first preview. */
export function smartScheduleStep(
  requested: boolean,
  acknowledged: boolean
): SmartScheduleStep {
  if (!requested) return 'idle';
  return acknowledged ? 'previewing' : 'confirming';
}

interface SmartScheduleDialogsProps {
  wsId: string;
  /** True from the moment someone picks Smart schedule until they close it. */
  requested: boolean;
  onRequestEnd: () => void;
}

/** Experimental warning plus the smart-schedule preview panel. */
export function SmartScheduleDialogs({
  wsId,
  requested,
  onRequestEnd,
}: SmartScheduleDialogsProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const step = smartScheduleStep(requested, acknowledged);

  return (
    <>
      <ExperimentalFeatureDialog
        open={step === 'confirming'}
        onConfirm={() => setAcknowledged(true)}
        onClose={onRequestEnd}
      />
      <SmartSchedulePreviewPanel
        wsId={wsId}
        isOpen={step === 'previewing'}
        onClose={onRequestEnd}
        mode="instant"
      />
    </>
  );
}
