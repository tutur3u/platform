import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: class extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code?: string
    ) {
      super(message);
    }
  },
  getWorkspaceMeetingShortLinks: api.get,
  createWorkspaceMeetingShortLink: api.create,
}));

import { InternalApiError } from '@tuturuuu/internal-api';
import {
  displayLink,
  generatedLink,
  loadMeetingShortLinks,
  shortLinkErrorKey,
} from './use-meeting-short-links';

const canonicalUrl = 'https://tuturuuu.com/meet/ws/meetings/m';
const link = {
  id: 'l1',
  slug: 'meet/Ab3dE9x',
  url: 'https://ttr.gg/meet/Ab3dE9x',
  kind: 'generated' as const,
  prefixed: true,
  expiresAt: '2026-12-21T00:00:00.000Z',
  clicks: 0,
  canEdit: false,
  canDelete: false,
};

describe('meeting short links loader', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps the canonical link for ineligible meetings', async () => {
    api.get.mockResolvedValue({
      eligible: false,
      staff: false,
      canonicalUrl,
      links: [link],
    });
    const state = await loadMeetingShortLinks('ws', 'm');
    expect(api.create).not.toHaveBeenCalled();
    expect(generatedLink(state)).toBeUndefined();
  });

  it('asks for (and renews) the generated link when eligible', async () => {
    api.get.mockResolvedValue({
      eligible: true,
      staff: false,
      canonicalUrl,
      links: [link],
    });
    api.create.mockResolvedValue({ link });
    const state = await loadMeetingShortLinks('ws', 'm');
    expect(api.create).toHaveBeenCalledWith('ws', 'm', { kind: 'generated' });
    expect(state.links).toHaveLength(1);
    expect(displayLink(generatedLink(state)!.url)).toBe('ttr.gg/meet/Ab3dE9x');
  });

  it('falls back when creation fails and maps error codes', async () => {
    api.get.mockResolvedValue({
      eligible: true,
      staff: false,
      canonicalUrl,
      links: [],
    });
    api.create.mockRejectedValue(
      new InternalApiError('x', 429, 'rate_limited')
    );
    expect(
      generatedLink(await loadMeetingShortLinks('ws', 'm'))
    ).toBeUndefined();
    expect(shortLinkErrorKey(new InternalApiError('x', 409, 'taken'))).toBe(
      'taken'
    );
    expect(shortLinkErrorKey(new Error('boom'))).toBe('unavailable');
  });
});
