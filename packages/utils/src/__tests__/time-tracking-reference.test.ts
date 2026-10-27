import { describe, expect, it, vi } from 'vitest';
import {
  TIME_TRACKING_REFERENCE_TABLES,
  validateTimeTrackingReference,
} from '../time-tracking-reference';

describe('time tracking references', () => {
  it('validates categories and the workspace_break_types table', () => {
    expect(TIME_TRACKING_REFERENCE_TABLES).toEqual([
      'time_tracking_categories',
      'workspace_break_types',
    ]);
  });

  it.each(TIME_TRACKING_REFERENCE_TABLES)(
    'scopes %s lookups and distinguishes lookup failures',
    async (table) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
      };
      const client = { from: vi.fn(() => query) };
      const input = {
        client: client as never,
        id: 'reference',
        table,
        wsId: 'workspace',
      };
      query.maybeSingle.mockResolvedValue({ data: null, error: null });
      expect(await validateTimeTrackingReference(input)).toMatchObject({
        status: 400,
      });
      expect(client.from).toHaveBeenCalledWith(table);
      expect(query.eq).toHaveBeenCalledWith('id', 'reference');
      expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace');
      query.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Unavailable' },
      });
      expect(await validateTimeTrackingReference(input)).toMatchObject({
        status: 500,
      });
      query.maybeSingle.mockResolvedValue({
        data: { id: 'reference' },
        error: null,
      });
      expect(await validateTimeTrackingReference(input)).toBeNull();
      client.from.mockClear();
      expect(
        await validateTimeTrackingReference({ ...input, id: null })
      ).toBeNull();
      expect(client.from).not.toHaveBeenCalled();
    }
  );
});
