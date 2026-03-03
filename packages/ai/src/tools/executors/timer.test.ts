import { describe, expect, it } from 'vitest';
import type { MiraToolContext } from '../mira-tools';
import { executeCreateTimeTrackingEntry, parseFlexibleDateTime } from './timer';

function createApprovalRequiredContext(): MiraToolContext {
  const supabase = {
    from(table: string) {
      if (table !== 'workspace_settings') {
        throw new Error(`Unexpected table access in test: ${table}`);
      }

      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          return {
            data: { missed_entry_date_threshold: 0 },
            error: null,
          };
        },
      };

      return builder;
    },
  };

  return {
    wsId: '00000000-0000-0000-0000-000000000000',
    userId: '11111111-1111-1111-1111-111111111111',
    supabase,
    timezone: 'Asia/Bangkok',
  } as unknown as MiraToolContext;
}

describe('parseFlexibleDateTime', () => {
  it('interprets HH:mm in provided timezone when date is provided', () => {
    const result = parseFlexibleDateTime('08:00', 'startTime', {
      date: '2026-02-24',
      timezone: 'Asia/Bangkok',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toISOString()).toBe('2026-02-24T01:00:00.000Z');
    }
  });

  it('accepts YYYY-MM-DD HH:mm format', () => {
    const result = parseFlexibleDateTime('2026-02-24 17:00', 'endTime');

    expect(result.ok).toBe(true);
  });

  it('rejects HH:mm when date is missing', () => {
    const result = parseFlexibleDateTime('17:00', 'endTime');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('when date is provided');
    }
  });
});

describe('executeCreateTimeTrackingEntry', () => {
  it('returns explicit next step when approval is required and request is not created', async () => {
    const ctx = createApprovalRequiredContext();

    const result = await executeCreateTimeTrackingEntry(
      {
        title: 'Frontend work',
        description: 'Introduce React Query',
        date: '2026-02-24',
        startTime: '08:00',
        endTime: '17:00',
      },
      ctx
    );

    expect(result).toMatchObject({
      success: true,
      requiresApproval: true,
      requestCreated: false,
    });

    if ('message' in result && typeof result.message === 'string') {
      expect(result.message).toContain('No request has been created yet.');
    }

    expect(result).toHaveProperty('nextStep');
    expect(result).toHaveProperty(
      'approvalRequest.startTime',
      '2026-02-24T01:00:00.000Z'
    );
    expect(result).toHaveProperty(
      'approvalRequest.endTime',
      '2026-02-24T10:00:00.000Z'
    );
  });
});
