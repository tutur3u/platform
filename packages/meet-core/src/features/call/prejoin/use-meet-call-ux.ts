'use client';

import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { useMeetUxV2 } from './prejoin-context';

export function useMeetCallUx() {
  return useMeetUxV2() && MEETING_APP === 'meet';
}
