import { describe, expect, it, vi } from 'vitest';
import { markDeliveryLogsSent } from './immediate-helpers';

describe('immediate delivery acceptance', () => {
  it('clears an error left by an earlier failed attempt', async () => {
    const query = Object.assign(Promise.resolve({ error: null }), {
      eq: vi.fn(),
      in: vi.fn(),
    });
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    const update = vi.fn(() => query);
    const sbAdmin = {
      schema: vi.fn(() => ({ from: vi.fn(() => ({ update })) })),
    };

    await markDeliveryLogsSent(sbAdmin, ['log-1']);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ error_message: null, status: 'sent' })
    );
  });
});
