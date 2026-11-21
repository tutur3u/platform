import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { reconnectCalendarProvider } from './calendar-reconnect-action';

function state() {
  return {
    googleAuthMutation: { mutate: vi.fn() },
    microsoftAuthMutation: { mutate: vi.fn() },
  } as unknown as Parameters<typeof reconnectCalendarProvider>[0];
}

it('asks Google for consent so a held account gets a fresh refresh token', () => {
  const value = state();
  reconnectCalendarProvider(value, 'google');
  expect(value.googleAuthMutation.mutate).toHaveBeenCalledWith({
    reconnect: true,
  });
  expect(value.microsoftAuthMutation.mutate).not.toHaveBeenCalled();
});

it('uses the Microsoft flow, which always asks for consent', () => {
  const value = state();
  reconnectCalendarProvider(value, 'microsoft');
  expect(value.microsoftAuthMutation.mutate).toHaveBeenCalledOnce();
  expect(value.googleAuthMutation.mutate).not.toHaveBeenCalled();
});

it('routes account recovery from both surfaces through the same consent action', () => {
  for (const file of [
    'calendar-sync-recovery.tsx',
    'calendar-connections-settings-content.tsx',
  ]) {
    const source = readFileSync(resolve(__dirname, file), 'utf8');
    expect(source).toContain('<CalendarAccountRecovery');
  }
  const recovery = readFileSync(
    resolve(__dirname, 'calendar-account-recovery.tsx'),
    'utf8'
  );
  expect(recovery).toContain(
    'reconnectCalendarProvider(state, account.provider, account.id)'
  );
  expect(recovery).not.toContain('googleAuthMutation.mutate');
});
