import { describe, expect, it } from 'vitest';
import {
  createCronLogDrainContext,
  createRequestLogDrainContext,
  shouldPersistLogDrainContext,
} from './log-drain';

describe('log drain request ids', () => {
  it('generates internal request ids instead of trusting inbound headers', () => {
    const context = createRequestLogDrainContext({
      request: new Request('https://app.example.com/api/test', {
        headers: {
          'x-request-id': 'attacker-controlled-request-id',
        },
        method: 'POST',
      }),
      route: '/api/test',
    });

    expect(context.requestId).toMatch(/^req-/u);
    expect(context.requestId).not.toBe('attacker-controlled-request-id');
    expect(context.clientRequestId).toBe('attacker-controlled-request-id');
  });

  it('keeps cron request ids internally generated too', () => {
    const context = createCronLogDrainContext({
      jobId: 'sample',
      path: '/api/cron/sample',
      request: new Request('https://app.example.com/api/cron/sample', {
        headers: {
          'x-request-id': 'cron-attacker-id',
        },
      }),
    });

    expect(context.requestId).toMatch(/^cron-/u);
    expect(context.requestId).not.toBe('cron-attacker-id');
    expect(context.clientRequestId).toBe('cron-attacker-id');
  });

  it('skips log-drain persistence for unauthorized cron responses', () => {
    const context = createCronLogDrainContext({
      jobId: 'sample',
      path: '/api/cron/sample',
      request: new Request('https://app.example.com/api/cron/sample'),
    });

    expect(shouldPersistLogDrainContext(context, 401)).toBe(false);
    expect(shouldPersistLogDrainContext(context, 403)).toBe(false);
    expect(shouldPersistLogDrainContext(context, 200)).toBe(true);
  });

  it('keeps unauthorized non-cron responses eligible for log-drain persistence', () => {
    const context = createRequestLogDrainContext({
      request: new Request('https://app.example.com/api/test'),
      route: '/api/test',
    });

    expect(shouldPersistLogDrainContext(context, 401)).toBe(true);
  });
});
