import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import en from '../../../../../apps/meet/messages/en.json';
import vi from '../../../../../apps/meet/messages/vi.json';
import parleyEn from '../../../../../apps/parley/messages/en.json';
import parleyVi from '../../../../../apps/parley/messages/vi.json';
import {
  MEET_AI_NOTICE_VERSION,
  meetAiDisclosure,
} from './ai-disclosure-state';
import { MEET_AI_LEGAL_REVISION, meetAiLegalLinks } from './ai-legal-links';
import { useMeetAiDisclosure } from './use-meet-ai-disclosure';

it('keeps unknown guest transcription unknown even when a workspace flag says off', () => {
  const query = {
    data: { available: false, sessions: [] },
    error: null,
  } as unknown as Parameters<typeof useMeetAiDisclosure>[0];
  expect(useMeetAiDisclosure(query, {}, false)).toEqual({
    audience: 'guest',
    disclosure: { kind: 'hidden' },
  });
  expect(
    useMeetAiDisclosure(query, { liveAssistant: { sessionId: 'live' } }, false)
      .disclosure
  ).toEqual({ kind: 'active', transcription: false, mira: true });
});

it('prioritizes actual active evidence across the entire status truth table', () => {
  for (const available of [undefined, false, true]) {
    for (const failed of [false, true]) {
      for (const transcriptionActive of [false, true]) {
        for (const miraActive of [false, true]) {
          const result = meetAiDisclosure({
            available,
            failed,
            transcriptionActive,
            miraActive,
          });
          expect(result).toEqual(
            transcriptionActive || miraActive
              ? {
                  kind: 'active',
                  transcription: transcriptionActive,
                  mira: miraActive,
                }
              : {
                  kind: failed
                    ? 'error'
                    : available === false
                      ? 'off'
                      : available === true
                        ? 'available'
                        : 'hidden',
                }
          );
        }
      }
    }
  }
});

it('pins display version and copy independently of server acknowledgement', () => {
  expect(MEET_AI_NOTICE_VERSION).toBe(1);
  const pins: Record<number, string> = {
    1: '7a1ebae4b82210edaf6df4f1207271cc802777b2d60688f4f30ed42c3463acab',
  };
  expect(
    createHash('sha256').update(JSON.stringify(en.meet_ai_notice)).digest('hex')
  ).toBe(pins[MEET_AI_NOTICE_VERSION]);
});

it('ships matching keys in both locales of every consuming app', () => {
  for (const messages of [vi, parleyEn, parleyVi]) {
    expect(Object.keys(messages.meet_ai_notice).sort()).toEqual(
      Object.keys(en.meet_ai_notice).sort()
    );
  }
  expect(parleyEn.meet_ai_notice).toEqual(en.meet_ai_notice);
  expect(parleyVi.meet_ai_notice).toEqual(vi.meet_ai_notice);
});

it('links the confirmed public legal routes without inventing a publication date', () => {
  expect(MEET_AI_LEGAL_REVISION.date).toBeNull();
  expect(meetAiLegalLinks('en', 'https://tuturuuu.com/')).toEqual({
    privacy: 'https://tuturuuu.com/privacy',
    terms: 'https://tuturuuu.com/terms',
    subprocessors: 'https://tuturuuu.com/legal/subprocessors',
  });
  expect(meetAiLegalLinks('vi', 'https://tuturuuu.com')).toEqual({
    privacy: 'https://tuturuuu.com/vi/privacy',
    terms: 'https://tuturuuu.com/vi/terms',
    subprocessors: 'https://tuturuuu.com/vi/legal/subprocessors',
  });
});
