// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  meetMailFragment,
  type MeetMailHandoff,
} from '@tuturuuu/utils/meet-mail-handoff';
import { MailActorProvider } from '@/components/mail-actor-provider';
import { MeetMailHandoffPreview } from './meet-mail-handoff-preview';
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const actorId = '00000000-0000-4000-8000-000000000001',
  workspaceId = '00000000-0000-4000-8000-000000000002';
let value: MeetMailHandoff;
beforeEach(() => {
  localStorage.clear();
  value = {
    v: 1,
    source: 'meet',
    id: crypto.randomUUID(),
    issuedAt: Date.now(),
    actorId,
    workspaceId,
    subject: 'Meeting',
    joinUrl: 'https://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w',
    body: 'Meeting\nhttps://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w',
    to: ['private@example.invalid'],
  };
  history.replaceState(
    {},
    '',
    '/en/' + workspaceId + '/inbox' + meetMailFragment(value)
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function tree(
  onImport: () => void,
  sourceKey = 'account',
  targetWorkspace = workspaceId
) {
  return h(
    MailActorProvider,
    { actorId },
    h(MeetMailHandoffPreview, {
      workspaceId: targetWorkspace,
      sourceKey,
      blocked: false,
      canImport: true,
      onImport,
    })
  );
}
it.each(['unmount', 'source change'] as const)(
  'does not finish import after %s while the browser claim is pending',
  async (transition) => {
    let finish!: () => void;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, callback: () => unknown) =>
          new Promise((resolve) => {
            finish = () => resolve(callback());
          }),
      },
    });
    const onImport = vi.fn();
    const view = render(tree(onImport));
    await screen.findByText('confirm');
    fireEvent.click(screen.getByRole('button', { name: 'import' }));
    if (transition === 'unmount') view.unmount();
    else view.rerender(tree(onImport, 'another-account'));
    await act(async () => {
      finish();
    });
    expect(onImport).not.toHaveBeenCalled();
  }
);
it('refuses a stale preview at explicit import and does not import after rerender', async () => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, callback: () => unknown) => callback(),
    },
  });
  const onImport = vi.fn();
  render(tree(onImport));
  await screen.findByText('confirm');
  vi.spyOn(Date, 'now').mockReturnValue(value.issuedAt + 300_001);
  fireEvent.click(screen.getByRole('button', { name: 'import' }));
  await screen.findByText('invalid');
  expect(onImport).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});
it('does not expose foreign workspace recipients or replace source state', async () => {
  const onImport = vi.fn();
  render(tree(onImport, 'account', actorId));
  await screen.findByText('invalid');
  expect(screen.queryByText('private@example.invalid')).toBeNull();
  expect(onImport).not.toHaveBeenCalled();
  expect(window.location.hash).toBe('');
});
