import { afterEach, expect, it, vi } from 'vitest';
import { createAuditRecord } from '../email-audit';

afterEach(() => vi.restoreAllMocks());

it.each(['returned', 'thrown'])(
  'logs only safe fields for a %s audit insert error',
  async (kind) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const privateValue = 'private@example.test';
    const error = {
      name: 'PostgrestError',
      code: '23505',
      message: privateValue,
      details: privateValue,
      hint: privateValue,
    };
    const single = vi.fn().mockResolvedValue({ data: null, error });
    if (kind === 'thrown') single.mockRejectedValueOnce(error);
    const supabase = {
      from: () => ({ insert: () => ({ select: () => ({ single }) }) }),
    };
    const result = await createAuditRecord(
      supabase as unknown as Parameters<typeof createAuditRecord>[0],
      {
        wsId: 'workspace-id',
        provider: 'ses',
        sourceName: 'Private sender',
        sourceEmail: privateValue,
        toAddresses: [privateValue],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Private subject',
      }
    );
    expect(result).toBeNull();
    expect(single).toHaveBeenCalledOnce();
    expect(log.mock.calls).toEqual([
      [
        kind === 'thrown'
          ? '[EmailAudit] Exception creating audit record:'
          : '[EmailAudit] Error creating audit record:',
        { name: 'PostgrestError', code: '23505' },
      ],
    ]);
  }
);
