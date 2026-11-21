// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FleetAccess } from '@tuturuuu/internal-api/fleet';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vi_ from '../../messages/vi.json';
import { I18nProvider, type Locale } from '../i18n';
import { FleetAccessPage } from './fleet-access-page';
import type { FleetTab } from './model';
import { fixtures } from './test-fixtures';
import type { FleetRead } from './upstream';

const api = vi.hoisted(() => ({
  fleetAccessFn: vi.fn(),
  fleetDigestFn: vi.fn(),
  fleetIntentsFn: vi.fn(),
  submitFleetIntentFn: vi.fn(),
  issueFleetLinkCodeFn: vi.fn(),
  confirmFleetLinkFn: vi.fn(),
}));
vi.mock('./api', () => api);
// The shell's navigation links need a router; its contract is tested there.
vi.mock('../components/shell', () => ({
  Shell: ({ children }: { children: ReactNode }) => <>{children}</>,
  Preferences: () => null,
}));

const t = en.fleetAccess;
const receipt = {
  id: '7d3c2f1e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  kind: 'status_question',
  state: 'pending_approval',
  createdAt: '2026-11-21T03:00:00.000Z',
} as const;

function show(
  access: FleetRead<FleetAccess>,
  tab?: FleetTab,
  locale: Locale = 'en'
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 1 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale={locale}>
        <FleetAccessPage access={access} tab={tab} onTabChange={() => {}} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

const live = (access: FleetAccess) => ({ kind: 'ok', data: access }) as const;

beforeEach(() => {
  api.fleetDigestFn.mockResolvedValue({ kind: 'ok', data: fixtures.digest });
  api.fleetIntentsFn.mockResolvedValue({
    kind: 'ok',
    data: { intents: [receipt], nextBefore: null },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Fleet access page', () => {
  it('shows an Observer no Approvals or Access tab', () => {
    show(live(fixtures.observer));
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual([
      t.tabs.status,
      t.tabs.ask,
      t.tabs.requests,
      t.tabs.link,
    ]);
    expect(screen.getByText(t.tier.observer)).toBeTruthy();
  });

  it('falls back to the first tab for one the caller cannot open', () => {
    show(
      live({ ...fixtures.observer, capabilities: ['intent.request'] }),
      'ask'
    );
    expect(screen.queryByRole('tab', { name: t.tabs.ask })).toBeNull();
    expect(
      screen
        .getByRole('tab', { name: t.tabs.requests })
        .getAttribute('aria-selected')
    ).toBe('true');
  });

  it('explains disabled, stopped and changed access without tabs', () => {
    const off = (stopped: boolean): FleetAccess => ({
      enabled: false,
      tier: null,
      projects: [],
      capabilities: [],
      stopped,
    });
    // Not having access is a state, not an error: nothing is announced.
    show(live(off(false)));
    expect(screen.getByText(t.gate.disabled)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    show(live(off(true)));
    expect(screen.getByText(t.gate.stopped)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    show({ kind: 'denied' });
    expect(screen.getByRole('alert').textContent).toBe(t.gate.denied);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('renders the scoped digest with its times and stale badge', async () => {
    show(live(fixtures.observer), 'status');
    expect(await screen.findByText('Checkout')).toBeTruthy();
    expect(screen.getByText(t.status.stale)).toBeTruthy();
    expect(screen.getByText(/^Generated /)).toBeTruthy();
    expect(screen.getByText(/^Received /)).toBeTruthy();
    expect(screen.getByText(t.blocker.review)).toBeTruthy();
  });

  it('shows a retry when the digest cannot load', async () => {
    api.fleetDigestFn.mockRejectedValue(new Error('down'));
    show(live(fixtures.observer), 'status');
    const retry = await screen.findByRole(
      'button',
      { name: t.common.retry },
      { timeout: 3_000 }
    );
    api.fleetDigestFn.mockResolvedValue({ kind: 'ok', data: fixtures.digest });
    fireEvent.click(retry);
    expect(await screen.findByText('Checkout')).toBeTruthy();
  });

  it('renders in Vietnamese', () => {
    show(live(fixtures.observer), undefined, 'vi');
    expect(screen.getByText(vi_.fleetAccess.title)).toBeTruthy();
    expect(screen.getByText(vi_.fleetAccess.tabs.status)).toBeTruthy();
  });
});

describe('Fleet requests', () => {
  it('lists receipts and reports a quota refusal, then a filed request', async () => {
    api.submitFleetIntentFn.mockResolvedValueOnce({
      kind: 'refused',
      reason: 'questions_per_hour',
    });
    show(live(fixtures.observer), 'requests');
    expect(await screen.findByText(t.receipt.pending_approval)).toBeTruthy();

    const send = screen.getByRole('button', { name: t.requests.submit });
    fireEvent.click(send);
    expect((await screen.findByRole('alert')).textContent).toBe(
      t.refusal.questions_per_hour
    );
    expect(api.submitFleetIntentFn).toHaveBeenCalledWith({
      data: {
        kind: 'status_question',
        payload: { projectKey: 'web', topic: 'status' },
      },
    });

    api.submitFleetIntentFn.mockResolvedValueOnce({
      kind: 'ok',
      data: { id: receipt.id },
    });
    fireEvent.click(send);
    expect(await screen.findByText(t.requests.submitted)).toBeTruthy();
    await waitFor(() => expect(api.fleetIntentsFn).toHaveBeenCalledTimes(2));
    expect(screen.getByText(receipt.id.slice(0, 8))).toBeTruthy();
  });

  it('marks Owner approval, focuses the first invalid field and confirms the hand-off', async () => {
    api.submitFleetIntentFn.mockResolvedValue({
      kind: 'ok',
      data: { id: receipt.id },
    });
    // Without `ask` the first kind is a comment filed for Owner approval.
    show(
      live({
        ...fixtures.observer,
        capabilities: ['status.read', 'intent.request'],
      }),
      'requests'
    );
    const kind = screen.getByLabelText(t.field.kind);
    const note = screen.getByText(t.requests.ownerApprovalNote);
    expect(kind.getAttribute('aria-describedby')).toContain(note.id);
    expect(screen.getByText(t.requests.ownerApproval)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.requests.submit }));
    const target = screen.getByLabelText(t.field.target);
    expect(document.activeElement).toBe(target);
    expect(target.getAttribute('aria-invalid')).toBe('true');
    expect(
      screen.getByLabelText(t.field.quoteRequired).getAttribute('aria-invalid')
    ).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe(t.requests.invalid);
    expect(api.submitFleetIntentFn).not.toHaveBeenCalled();

    fireEvent.change(target, { target: { value: 'lane-web' } });
    fireEvent.change(screen.getByLabelText(t.field.quoteRequired), {
      target: { value: 'Please check the release notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.requests.submit }));
    expect(
      await screen.findByText(t.requests.submittedForApproval)
    ).toBeTruthy();
    expect(api.submitFleetIntentFn).toHaveBeenCalledWith({
      data: {
        kind: 'comment',
        payload: { projectKey: 'web', targetKey: 'lane-web' },
        quote: 'Please check the release notes',
      },
    });
  });
});

describe('Chat identity linking', () => {
  it('issues a code, previews the pending link and confirms it', async () => {
    const code = 'c'.repeat(43);
    const linkId = '1d3c2f1e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
    api.issueFleetLinkCodeFn.mockResolvedValue({
      kind: 'ok',
      data: { code, expiresIn: 600 },
    });
    const display = { channel: 'zalo', accountLabel: 'Ops desk' } as const;
    api.confirmFleetLinkFn
      .mockResolvedValueOnce({
        kind: 'ok',
        data: { ...display, linked: false },
      })
      .mockResolvedValueOnce({
        kind: 'ok',
        data: { ...display, linked: true },
      });
    show(live(fixtures.observer), 'link');

    fireEvent.click(screen.getByRole('button', { name: t.link.issue }));
    expect(await screen.findByText(code)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(t.link.linkId), {
      target: { value: linkId },
    });
    fireEvent.change(screen.getByLabelText(t.link.confirmation), {
      target: { value: ` ${code} ` },
    });
    fireEvent.click(screen.getByRole('button', { name: t.link.preview }));
    expect(await screen.findByText(t.link.pending)).toBeTruthy();
    expect(screen.getByText('Zalo')).toBeTruthy();
    expect(screen.getByText('Ops desk')).toBeTruthy();
    expect(api.confirmFleetLinkFn).toHaveBeenLastCalledWith({
      data: { linkId, confirmationCode: code, preview: true },
    });

    fireEvent.click(screen.getByRole('button', { name: t.link.confirm }));
    expect(await screen.findByText(t.link.linked)).toBeTruthy();
    expect(api.confirmFleetLinkFn).toHaveBeenLastCalledWith({
      data: { linkId, confirmationCode: code },
    });
  });

  it('keeps the entry form and reports a mismatched confirmation', async () => {
    api.confirmFleetLinkFn.mockResolvedValue({
      kind: 'refused',
      reason: 'invalid_confirmation',
    });
    show(live(fixtures.observer), 'link');
    fireEvent.change(screen.getByLabelText(t.link.linkId), {
      target: { value: '1d3c2f1e-4b5a-4c6d-8e7f-9a0b1c2d3e4f' },
    });
    fireEvent.change(screen.getByLabelText(t.link.confirmation), {
      target: { value: 'c'.repeat(43) },
    });
    fireEvent.click(screen.getByRole('button', { name: t.link.preview }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(t.refusal.invalid_confirmation);
    for (const label of [t.link.linkId, t.link.confirmation]) {
      const field = screen.getByLabelText(label);
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(field.getAttribute('aria-describedby')).toContain(alert.id);
    }
  });
});
