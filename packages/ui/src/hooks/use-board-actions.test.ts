import { describe, expect, it } from 'vitest';
import { getBoardActionError } from './use-board-actions';

describe('getBoardActionError', () => {
  it('uses the API error field returned by board lifecycle routes', async () => {
    const response = Response.json(
      { error: "You don't have access to this workspace" },
      { status: 403 }
    );

    await expect(getBoardActionError(response, 'fallback')).resolves.toBe(
      "You don't have access to this workspace"
    );
  });

  it('falls back when the response is not JSON', async () => {
    const response = new Response('Bad gateway', { status: 502 });

    await expect(
      getBoardActionError(response, 'Board action failed')
    ).resolves.toBe('Board action failed');
  });
});
