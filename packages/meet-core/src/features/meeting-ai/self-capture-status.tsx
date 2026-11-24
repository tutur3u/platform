'use client';

import { Loader2 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { SelfCaptureState } from './self-lifecycle';

const KEYS: Record<SelfCaptureState['kind'], string> = {
  off: 'self_state_off',
  capturing: 'self_state_capturing',
  paused: 'self_state_paused',
  unsupported: 'self_state_unsupported',
  guest: 'self_state_guest',
  app: 'self_state_app',
  stopped: 'self_state_stopped',
};

/** The participant's own capture state, shown only to that participant. */
export function SelfCaptureStatus({ state }: { state: SelfCaptureState }) {
  const t = useTranslations('meet.ai');
  return (
    <p
      role="status"
      data-capture-state={state.kind}
      className="flex items-center gap-1.5 text-xs"
    >
      {state.kind === 'paused' && (
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
      )}
      {t(KEYS[state.kind])}
    </p>
  );
}
