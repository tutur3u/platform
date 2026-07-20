import type { calendar_v3 } from '@tuturuuu/google';
import { describe, expect, it } from 'vitest';
import { getCancelledGoogleEventIds } from './incremental-active-sync';

describe('getCancelledGoogleEventIds', () => {
  it('extracts id-only Google deletion tombstones without event dates', () => {
    const events: calendar_v3.Schema$Event[] = [
      { id: 'deleted-event', status: 'cancelled' },
      { id: 'active-event', status: 'confirmed' },
      { status: 'cancelled' },
      { id: 'deleted-event', status: 'cancelled' },
    ];

    expect(getCancelledGoogleEventIds(events)).toEqual(['deleted-event']);
  });
});
