import { InternalApiError } from '@tuturuuu/internal-api';
import type { UpskiiPresentation } from '@tuturuuu/realtime/meet/room-upskii-presentation';
import { describe, expect, it } from 'vitest';
import {
  displayUpskiiLink,
  isSettledUpskiiRefusal,
  toPresentationItem,
  upskiiListState,
} from './upskii-list-state';
import { upskiiPanelView, upskiiRequestErrorKey } from './upskii-panel-view';

const item = {
  id: 'l4',
  title: 'Responsible AI in your class',
  kind: 'lesson' as const,
  url: 'https://app.upskii.com/classes/c1/lessons/l4',
  updatedAt: null,
  classId: 'c1',
};
const query = {
  isPending: false,
  isFetching: false,
  error: null,
  items: undefined,
  hasNextPage: false,
  isFetchingNextPage: false,
};
const refusal = (code: string, status = 403) =>
  new InternalApiError('refused', status, code);

describe('upskiiListState', () => {
  it('names each state exactly once', () => {
    expect(upskiiListState({ ...query, isPending: true })).toEqual({
      kind: 'loading',
    });
    expect(upskiiListState({ ...query, items: [] })).toEqual({ kind: 'empty' });
    expect(
      upskiiListState({ ...query, items: [item], hasNextPage: true })
    ).toEqual({
      kind: 'ready',
      items: [item],
      hasMore: true,
      loadingMore: false,
    });
    expect(
      upskiiListState({ ...query, error: refusal('NOT_LINKED', 404) })
    ).toEqual({ kind: 'unlinked' });
    expect(
      upskiiListState({ ...query, error: refusal('EARLY_ACCESS_ONLY') })
    ).toEqual({ kind: 'early_access' });
    expect(
      upskiiListState({ ...query, error: refusal('SCOPE_NOT_GRANTED') })
    ).toEqual({ kind: 'scope' });
    expect(
      upskiiListState({
        ...query,
        error: new Error('offline'),
        isFetching: true,
      })
    ).toEqual({ kind: 'error', retrying: true });
  });

  it('keeps loaded items visible when a later page fails', () => {
    expect(
      upskiiListState({ ...query, items: [item], error: new Error('offline') })
        .kind
    ).toBe('ready');
  });

  it('does not retry refusals only the account link can change', () => {
    expect(isSettledUpskiiRefusal(refusal('NOT_LINKED', 404))).toBe(true);
    expect(isSettledUpskiiRefusal(refusal('CLASS_NOT_FOUND', 404))).toBe(true);
    expect(isSettledUpskiiRefusal(new Error('offline'))).toBe(false);
  });
});

describe('presentation items', () => {
  it('shares a label and the checked link, never a class', () => {
    expect(toPresentationItem(item, 'EduFest')).toEqual({
      kind: 'lesson',
      id: 'l4',
      title: item.title,
      classTitle: 'EduFest',
      url: item.url,
    });
    expect(toPresentationItem({ ...item, kind: 'class' })).toBeNull();
  });

  it('shows the host and path under the QR code', () => {
    expect(displayUpskiiLink('https://app.upskii.com/a/b?token=x#y')).toBe(
      'app.upskii.com/a/b'
    );
    expect(
      displayUpskiiLink(`https://app.upskii.com/${'a'.repeat(80)}`)
    ).toHaveLength(60);
  });
});

describe('upskiiPanelView', () => {
  const presentation: UpskiiPresentation = {
    item: { kind: 'lesson', id: 'l4', title: item.title, url: item.url },
    presenterId: 'host',
    startedAt: '2026-12-05T08:00:00Z',
    revision: 1,
  };
  const room = { connected: true, presentation: null, canPresent: false };

  it('shows participants only what the room shares', () => {
    expect(upskiiPanelView({ ...room, connected: false }, false).kind).toBe(
      'connecting'
    );
    expect(upskiiPanelView(room, false)).toEqual({ kind: 'waiting' });
    expect(upskiiPanelView(room, true)).toEqual({ kind: 'waiting' });
    expect(upskiiPanelView({ ...room, presentation }, true)).toEqual({
      kind: 'presenting',
      presentation,
      canPresent: false,
    });
  });

  it('lets a presenter pick, present and choose again', () => {
    const host = { ...room, canPresent: true };
    expect(upskiiPanelView(host, false)).toEqual({
      kind: 'picking',
      current: null,
    });
    expect(upskiiPanelView({ ...host, presentation }, false).kind).toBe(
      'presenting'
    );
    expect(upskiiPanelView({ ...host, presentation }, true)).toEqual({
      kind: 'picking',
      current: presentation,
    });
  });

  it('maps refusals to their messages', () => {
    expect(upskiiRequestErrorKey('upskii_url_rejected')).toBe('url_rejected');
    expect(upskiiRequestErrorKey('permission_denied')).toBe(
      'permission_denied'
    );
    expect(upskiiRequestErrorKey('upskii_rate_limited')).toBe('request_failed');
  });
});
