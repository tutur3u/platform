import { describe, expect, it } from 'vitest';
import {
  failureReason,
  WorkbenchStepError,
  workbenchFailure,
} from './workbench-errors';

const status = (value: number) =>
  Object.assign(new Error('api'), { status: value });

describe('workbench failures', () => {
  it('maps API statuses to reasons the console can explain', () => {
    expect(failureReason(status(403))).toBe('access');
    expect(failureReason(status(401))).toBe('access');
    expect(failureReason(status(409))).toBe('changed');
    expect(failureReason(status(503))).toBe('busy');
    expect(failureReason(status(429))).toBe('busy');
    expect(failureReason(status(500))).toBe('unknown');
    expect(failureReason(new TypeError('Failed to fetch'))).toBe('offline');
  });

  it('reports the checkpoint step when a run fails while saving the room', () => {
    expect(
      workbenchFailure({ run: new WorkbenchStepError('save', status(503)) })
    ).toEqual({ step: 'save', reason: 'busy' });
    expect(workbenchFailure({ run: status(409) })).toEqual({
      step: 'run',
      reason: 'changed',
    });
  });

  it('orders steps the way the user meets them and stays quiet without errors', () => {
    expect(
      workbenchFailure({ result: status(500), test: status(403) })
    ).toEqual({ step: 'result', reason: 'unknown' });
    expect(workbenchFailure({})).toBeNull();
  });
});
