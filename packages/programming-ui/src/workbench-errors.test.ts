import { describe, expect, it } from 'vitest';
import {
  failureReason,
  isRunnerUnavailable,
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
    expect(failureReason(status(429))).toBe('busy');
    expect(failureReason(status(502))).toBe('unavailable');
    expect(failureReason(status(503))).toBe('unavailable');
    expect(failureReason(status(504))).toBe('unavailable');
    expect(failureReason(status(500))).toBe('unknown');
    expect(failureReason(new TypeError('Failed to fetch'))).toBe('offline');
  });

  it('reports the checkpoint step when a run fails while saving the room', () => {
    expect(
      workbenchFailure({ run: new WorkbenchStepError('save', status(503)) })
    ).toEqual({ step: 'save', reason: 'unavailable' });
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

  it('treats only a run the runner refused as the runner being unavailable', () => {
    expect(isRunnerUnavailable(status(503))).toBe(true);
    expect(isRunnerUnavailable(status(502))).toBe(true);
    expect(isRunnerUnavailable(status(500))).toBe(false);
    expect(
      isRunnerUnavailable(new WorkbenchStepError('save', status(503)))
    ).toBe(false);
    expect(
      isRunnerUnavailable(new WorkbenchStepError('run', status(504)))
    ).toBe(true);
  });
});

it('shows Playground capacity and pause refusals independently of the HTTP status', () => {
  expect(failureReason({ status: 429, code: 'PLAYGROUND_CAPACITY' })).toBe(
    'capacity'
  );
  expect(failureReason({ status: 503, code: 'PLAYGROUND_PAUSED' })).toBe(
    'paused'
  );
});
