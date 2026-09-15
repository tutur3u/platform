import { expect, it } from 'vitest';
import { recoverMediaState } from './recover-media-state';

const off = { audioEnabled: false, videoEnabled: false, screenEnabled: false };
it('never reopens capture muted while a device replacement was publishing', () => {
  const on = { ...off, audioEnabled: true };
  expect(recoverMediaState(on, on, on, false).audioEnabled).toBe(false);
});
it('keeps a requested mute even when its publication fails', () => {
  expect(
    recoverMediaState({ ...off, audioEnabled: true }, off, off, true)
      .audioEnabled
  ).toBe(false);
});
it('rolls back a failed unmute while preserving an independent camera change', () => {
  expect(
    recoverMediaState(
      off,
      { ...off, audioEnabled: true },
      { ...off, audioEnabled: true, videoEnabled: true },
      true
    )
  ).toEqual({ ...off, videoEnabled: true });
});
