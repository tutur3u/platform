import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_BLOCK } from './hour-settings-shared';
import { createSafeTimeRanges } from './time-range-picker-helpers';

describe('createSafeTimeRanges', () => {
  it('repairs incomplete and invalid persisted time blocks', () => {
    const malformed = {
      monday: {
        enabled: true,
        timeBlocks: [
          { endTime: '18:00' },
          { startTime: '25:00', endTime: 'invalid' },
        ],
      },
    } as never;

    const ranges = createSafeTimeRanges(malformed);

    expect(ranges.monday).toEqual({
      enabled: true,
      timeBlocks: [
        { startTime: DEFAULT_TIME_BLOCK.startTime, endTime: '18:00' },
        DEFAULT_TIME_BLOCK,
      ],
    });
    expect(ranges.tuesday).toEqual({
      enabled: false,
      timeBlocks: [DEFAULT_TIME_BLOCK],
    });
  });
});
