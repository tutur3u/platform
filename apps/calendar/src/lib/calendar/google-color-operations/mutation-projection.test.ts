import { Buffer } from 'node:buffer';
import { decryptField } from '@tuturuuu/utils/encryption';
import { describe, expect, it, vi } from 'vitest';
import type { GoogleMutationCompletion } from './mutation-executor';
import { createGoogleMutationProjection } from './mutation-projection';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/client', () => ({ createClient: vi.fn() }));
const identity = {
  wsId: '22222222-2222-4222-8222-222222222222',
  eventId: '33333333-3333-4333-8333-333333333333',
  connectionId: '44444444-4444-4444-8444-444444444444',
  authTokenId: '55555555-5555-4555-8555-555555555555',
  calendarId: 'calendar',
  providerEventId: 'provider-event',
};
const key = Buffer.alloc(32, 18);
const completion: GoogleMutationCompletion = {
  deleted: false,
  outcome: 'applied',
  event: {
    id: identity.providerEventId,
    etag: 'authoritative-version',
    summary: 'Authoritative title',
    description: 'Authoritative description',
    location: 'Authoritative location',
    start: { dateTime: '2026-10-02T10:00:00Z' },
    end: { dateTime: '2026-10-02T11:00:00Z' },
    colorId: '11',
  },
  localPatch: { locked: false },
};
function fixture() {
  const access = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
  const getKey = vi.fn().mockResolvedValue(key);
  return {
    access,
    getKey,
    project: createGoogleMutationProjection({ access, getKey }),
  };
}
describe('authoritative encrypted mutation projection', () => {
  it('encrypts all sensitive fields from the observed event with the existing workspace key', async () => {
    const f = fixture();
    const snapshot = await f.project(completion, identity);
    if (snapshot.deleted) throw new Error('Unexpected deletion');
    expect(JSON.stringify(snapshot)).not.toContain('Authoritative title');
    expect(decryptField(snapshot.projection.title, key)).toBe(
      'Authoritative title'
    );
    expect(decryptField(snapshot.projection.description, key)).toBe(
      'Authoritative description'
    );
    expect(decryptField(snapshot.projection.location!, key)).toBe(
      'Authoritative location'
    );
    expect(snapshot.projection).toMatchObject({
      is_encrypted: true,
      locked: false,
    });
    expect(snapshot.metadata.google_color).toMatchObject({
      color_id: '11',
      calendar_id: 'calendar',
    });
    expect(f.access.assertAllowed).toHaveBeenCalledTimes(2);
  });
  it('fails closed when the existing key is absent rather than writing plaintext or creating a replacement', async () => {
    const f = fixture();
    f.getKey.mockResolvedValue(null);
    await expect(f.project(completion, identity)).rejects.toThrow(
      'Workspace key unavailable'
    );
  });
  it('rejects a provider identity or incomplete time projection', async () => {
    const f = fixture();
    if (completion.deleted) throw new Error('Unexpected deletion');
    await expect(
      f.project(
        { ...completion, event: { ...completion.event, id: 'another-event' } },
        identity
      )
    ).rejects.toThrow('Google projection unavailable');
    await expect(
      f.project(
        { ...completion, event: { ...completion.event, start: undefined } },
        identity
      )
    ).rejects.toThrow('Google projection unavailable');
  });
  it('never carries the old local lock intent into a superseding authoritative event', async () => {
    const f = fixture();
    const snapshot = await f.project(
      { ...completion, outcome: 'superseded' },
      identity
    );
    if (snapshot.deleted) throw new Error('Unexpected deletion');
    expect(snapshot.projection).not.toHaveProperty('locked');
  });
  it('does not project after authorization changes', async () => {
    const f = fixture();
    f.access.assertAllowed
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('revoked'));
    await expect(f.project(completion, identity)).rejects.toThrow('revoked');
  });
});
