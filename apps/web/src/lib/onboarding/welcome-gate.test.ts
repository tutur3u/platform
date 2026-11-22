import { describe, expect, it } from 'vitest';
import {
  isWelcomeFinished,
  resolveWelcomeEntry,
  shouldShowWelcomeNudge,
} from './welcome-gate';

const NOW = new Date('2026-11-23T00:00:00.000Z');

describe('resolveWelcomeEntry', () => {
  it('sends a signed-out visitor to sign in, even on a replay', () => {
    expect(
      resolveWelcomeEntry({ progress: null, replay: false, signedIn: false })
    ).toBe('login');
    expect(
      resolveWelcomeEntry({ progress: null, replay: true, signedIn: false })
    ).toBe('login');
  });

  it('shows the flow to a signed-in user with no progress yet', () => {
    expect(
      resolveWelcomeEntry({ progress: null, replay: false, signedIn: true })
    ).toBe('welcome');
  });

  it('shows the flow while it is neither completed nor skipped', () => {
    expect(
      resolveWelcomeEntry({
        progress: { completed_at: null, dismissed_at: null },
        replay: false,
        signedIn: true,
      })
    ).toBe('welcome');
  });

  it('sends a completed user to their workspace', () => {
    expect(
      resolveWelcomeEntry({
        progress: { completed_at: '2026-11-20T00:00:00Z' },
        replay: false,
        signedIn: true,
      })
    ).toBe('workspace');
  });

  it('treats a skipped flow as finished', () => {
    expect(
      resolveWelcomeEntry({
        progress: { dismissed_at: '2026-11-20T00:00:00Z' },
        replay: false,
        signedIn: true,
      })
    ).toBe('workspace');
  });

  it('replays the flow for a finished user when asked', () => {
    expect(
      resolveWelcomeEntry({
        progress: { completed_at: '2026-11-20T00:00:00Z' },
        replay: true,
        signedIn: true,
      })
    ).toBe('welcome');
  });
});

describe('shouldShowWelcomeNudge', () => {
  it('nudges a recent account that has not finished', () => {
    expect(
      shouldShowWelcomeNudge({
        now: NOW,
        progress: null,
        userCreatedAt: '2026-11-20T00:00:00Z',
      })
    ).toBe(true);
  });

  it('never nudges a finished or skipped flow', () => {
    for (const progress of [
      { completed_at: '2026-11-21T00:00:00Z' },
      { dismissed_at: '2026-11-21T00:00:00Z' },
    ]) {
      expect(isWelcomeFinished(progress)).toBe(true);
      expect(
        shouldShowWelcomeNudge({
          now: NOW,
          progress,
          userCreatedAt: '2026-11-20T00:00:00Z',
        })
      ).toBe(false);
    }
  });

  it('leaves long-standing accounts alone', () => {
    expect(
      shouldShowWelcomeNudge({
        now: NOW,
        progress: null,
        userCreatedAt: '2025-01-01T00:00:00Z',
      })
    ).toBe(false);
  });

  it('ignores a missing or invalid creation date', () => {
    expect(
      shouldShowWelcomeNudge({ now: NOW, progress: null, userCreatedAt: null })
    ).toBe(false);
    expect(
      shouldShowWelcomeNudge({
        now: NOW,
        progress: null,
        userCreatedAt: 'not-a-date',
      })
    ).toBe(false);
  });
});
