import { describe, expect, it } from 'vitest';
import { createDefaultHoursSettings } from './hour-settings-shared';

describe('Calendar automatically created hours', () => {
  it('provides Calendar defaults without establishing teacher availability consent', () => {
    expect(createDefaultHoursSettings().workHours.monday).toEqual({
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    });
  });
});
