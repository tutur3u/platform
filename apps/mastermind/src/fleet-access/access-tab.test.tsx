// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  FleetAccess,
  FleetOwnerConsole,
} from '@tuturuuu/internal-api/fleet';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import { I18nProvider } from '../i18n';
import {
  FLEET_SERVER_FUNCTIONS,
  fleetServerFunctionId,
} from '../native/fleet-admission';
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
const owner = vi.hoisted(() => ({
  fleetOwnerConsoleFn: vi.fn(),
  grantFleetAccessFn: vi.fn(),
  revokeFleetAccessFn: vi.fn(),
  setFleetStoppedFn: vi.fn(),
  upsertFleetProjectFn: vi.fn(),
  setFleetDisplayValueFn: vi.fn(),
}));
vi.mock('./api', () => api);
vi.mock('./owner-api', () => owner);
vi.mock('../components/shell', () => ({
  Shell: ({ scope, children }: { scope: string; children: ReactNode }) => (
    <div data-testid="shell" data-scope={scope}>
      {children}
    </div>
  ),
  PageHeader: ({ title }: { title: ReactNode }) => <h1>{title}</h1>,
}));

const t = en.fleetAccess;
const a = t.access;
const granteeId = 'fd000000-0000-4000-8000-000000000002';
const consoleData: FleetOwnerConsole = {
  stopped: false,
  generation: '4',
  grants: [
    {
      userId: granteeId,
      email: 'lead@example.com',
      tier: 'steerer',
      capabilities: ['status.read', 'comment'],
      projects: ['web'],
      expiresAt: null,
      revokedAt: null,
      status: 'active',
      generation: '2',
      questionsPerHour: 30,
      intentsPerDay: 10,
      modelBudgetPerMonth: 0,
    },
  ],
  projects: [
    {
      key: 'web',
      nameEn: 'Web',
      nameVi: 'Web',
      displayValues: { lane: ['Search'], releaseTitle: [], readinessItem: [] },
    },
  ],
};
const stoppedAccess: FleetAccess = {
  enabled: false,
  tier: null,
  projects: [],
  capabilities: [],
  stopped: true,
};

function show(access: FleetRead<FleetAccess>, tab?: FleetTab) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="en">
        <FleetAccessPage access={access} tab={tab} onTabChange={() => {}} />
      </I18nProvider>
    </QueryClientProvider>
  );
}
const live = (access: FleetAccess) => ({ kind: 'ok', data: access }) as const;
// Radix checkboxes measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
const dialog = () => within(screen.getByRole('alertdialog'));

beforeEach(() => {
  owner.fleetOwnerConsoleFn.mockResolvedValue({
    kind: 'ok',
    data: consoleData,
  });
  for (const fn of [
    owner.grantFleetAccessFn,
    owner.revokeFleetAccessFn,
    owner.setFleetStoppedFn,
    owner.upsertFleetProjectFn,
    owner.setFleetDisplayValueFn,
  ]) {
    fn.mockResolvedValue({ kind: 'ok', data: { result: 'ok' } });
  }
  api.fleetDigestFn.mockResolvedValue({ kind: 'ok', data: fixtures.digest });
  api.fleetIntentsFn.mockResolvedValue({
    kind: 'ok',
    data: { intents: [], nextBefore: null },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Access tab visibility', () => {
  it('lists grants for the Owner', async () => {
    show(live(fixtures.owner), 'access');
    expect(screen.getByRole('tab', { name: t.tabs.access })).toBeTruthy();
    expect(await screen.findByText('lead@example.com')).toBeTruthy();
    const row = screen.getByText('lead@example.com').closest('tr');
    expect(row?.textContent).toContain(t.tier.steerer);
    expect(row?.textContent).toContain(t.grantStatus.active);
    expect(row?.textContent).toContain(a.noExpiry);
  });

  it('never shows Access or reads the console for grantees', () => {
    for (const access of [
      fixtures.observer,
      fixtures.steerer,
      { ...fixtures.steerer, tier: 'operator' as const },
    ]) {
      show(live(access), 'access');
      expect(screen.queryByRole('tab', { name: t.tabs.access })).toBeNull();
      cleanup();
    }
    expect(owner.fleetOwnerConsoleFn).not.toHaveBeenCalled();
  });

  it('gives a stopped Owner the Access tab alone, with a confirmed resume', async () => {
    owner.fleetOwnerConsoleFn.mockResolvedValue({
      kind: 'ok',
      data: { ...consoleData, stopped: true, generation: '5' },
    });
    show(live(stoppedAccess));
    const toggle = await screen.findByRole('switch', { name: a.switch });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      t.tabs.access,
    ]);
    expect(screen.getByTestId('shell').dataset.scope).toBe('owner');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(dialog().getByText(a.resumeTitle)).toBeTruthy();
    fireEvent.click(dialog().getByRole('button', { name: a.resume }));
    await waitFor(() =>
      expect(owner.setFleetStoppedFn).toHaveBeenCalledWith({
        data: { stopped: false, expectedGeneration: '5' },
      })
    );
  });

  it('shows a stopped grantee the stop without tabs', async () => {
    owner.fleetOwnerConsoleFn.mockRejectedValue(new Error('403'));
    show(live(stoppedAccess));
    expect(await screen.findByText(t.gate.stopped)).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByTestId('shell').dataset.scope).toBe('fleet');
    expect(owner.fleetOwnerConsoleFn).toHaveBeenCalledTimes(1);
  });

  it('asks for a fresh second factor when Web refuses the MFA proof', async () => {
    owner.fleetOwnerConsoleFn.mockResolvedValue({
      kind: 'denied',
      reason: 'mfa_required',
    });
    show(live(fixtures.owner), 'access');
    expect((await screen.findByRole('alert')).textContent).toContain(a.mfa);
  });
});

describe('Access changes', () => {
  it('stops Fleet only after the confirmation', async () => {
    show(live(fixtures.owner), 'access');
    const toggle = await screen.findByRole('switch', { name: a.switch });
    fireEvent.click(toggle);
    expect(dialog().getByText(a.stopBody)).toBeTruthy();
    fireEvent.click(dialog().getByRole('button', { name: a.cancel }));
    expect(owner.setFleetStoppedFn).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    fireEvent.click(dialog().getByRole('button', { name: a.stop }));
    await waitFor(() =>
      expect(owner.setFleetStoppedFn).toHaveBeenCalledWith({
        data: { stopped: true, expectedGeneration: '4' },
      })
    );
  });

  it('validates, reviews and confirms a new grant', async () => {
    owner.grantFleetAccessFn.mockResolvedValue({
      kind: 'ok',
      data: { result: 'granted', userId: granteeId, generation: '1' },
    });
    show(live(fixtures.owner), 'access');
    fireEvent.click(await screen.findByRole('button', { name: a.grant }));
    fireEvent.click(screen.getByRole('button', { name: a.review }));
    expect(screen.getByRole('alert').textContent).toBe(a.invalidForm);
    expect(screen.getByLabelText(a.email).getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(document.activeElement?.id).toBe('fleet-grant-email');

    fireEvent.change(screen.getByLabelText(a.email), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Web' }));
    fireEvent.click(screen.getByRole('button', { name: a.review }));
    expect(
      dialog().getByText('Grant Observer access to new@example.com?')
    ).toBeTruthy();
    expect(owner.grantFleetAccessFn).not.toHaveBeenCalled();
    fireEvent.click(dialog().getByRole('button', { name: a.confirm }));
    await waitFor(() =>
      expect(owner.grantFleetAccessFn).toHaveBeenCalledWith({
        data: {
          email: 'new@example.com',
          tier: 'observer',
          capabilities: ['status.read', 'ask', 'intent.request'],
          projectKeys: ['web'],
          expiresAt: null,
          questionsPerHour: 30,
          intentsPerDay: 10,
          modelBudgetPerMonth: 0,
          expectedGeneration: null,
        },
      })
    );
    expect(await screen.findByText(a.granted)).toBeTruthy();
    expect(screen.queryByLabelText(a.email)).toBeNull();
  });

  it('edits a grant at the generation it read and keeps a refusal on the form', async () => {
    owner.grantFleetAccessFn.mockResolvedValue({
      kind: 'refused',
      reason: 'generation_changed',
    });
    show(live(fixtures.owner), 'access');
    const row = (await screen.findByText('lead@example.com')).closest('tr');
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: a.edit })
    );
    expect(screen.getByText(a.editGrant)).toBeTruthy();
    expect(screen.queryByLabelText(a.email)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: a.review }));
    expect(
      dialog().getByText('Update access for lead@example.com?')
    ).toBeTruthy();
    fireEvent.click(dialog().getByRole('button', { name: a.confirm }));
    await waitFor(() =>
      expect(owner.grantFleetAccessFn).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'lead@example.com',
          tier: 'steerer',
          capabilities: ['status.read', 'comment'],
          expectedGeneration: '2',
        }),
      })
    );
    expect(
      await screen.findByText(t.ownerRefusal.generation_changed)
    ).toBeTruthy();
    expect(screen.getByText(a.editGrant)).toBeTruthy();
  });

  it('revokes only after the confirmation', async () => {
    show(live(fixtures.owner), 'access');
    fireEvent.click(await screen.findByRole('button', { name: a.revoke }));
    expect(dialog().getByText('Revoke lead@example.com?')).toBeTruthy();
    expect(owner.revokeFleetAccessFn).not.toHaveBeenCalled();
    fireEvent.click(dialog().getByRole('button', { name: a.revoke }));
    await waitFor(() =>
      expect(owner.revokeFleetAccessFn).toHaveBeenCalledWith({
        data: { userId: granteeId, expectedGeneration: '2' },
      })
    );
  });

  it('adds a catalog project and refuses an invalid key', async () => {
    show(live(fixtures.owner), 'access');
    fireEvent.change(await screen.findByLabelText(a.key), {
      target: { value: 'Mobile App' },
    });
    fireEvent.change(screen.getByLabelText(a.nameEn), {
      target: { value: 'Mobile' },
    });
    fireEvent.change(screen.getByLabelText(a.nameVi), {
      target: { value: 'Di động' },
    });
    fireEvent.click(screen.getByRole('button', { name: a.addProject }));
    expect(screen.getByText(a.invalid)).toBeTruthy();
    expect(owner.upsertFleetProjectFn).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(a.key), {
      target: { value: 'mobile' },
    });
    fireEvent.click(screen.getByRole('button', { name: a.addProject }));
    await waitFor(() =>
      expect(owner.upsertFleetProjectFn).toHaveBeenCalledWith({
        data: { key: 'mobile', nameEn: 'Mobile', nameVi: 'Di động' },
      })
    );
  });

  it('approves a display value and removes one after the confirmation', async () => {
    show(live(fixtures.owner), 'access');
    expect(await screen.findByText('Search')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(a.value), {
      target: { value: ' Checkout ' },
    });
    fireEvent.click(screen.getByRole('button', { name: a.approve }));
    await waitFor(() =>
      expect(owner.setFleetDisplayValueFn).toHaveBeenCalledWith({
        data: {
          projectKey: 'web',
          field: 'lane',
          value: 'Checkout',
          approved: true,
        },
      })
    );
    fireEvent.click(screen.getByRole('button', { name: a.remove }));
    expect(dialog().getByText(a.removeBody)).toBeTruthy();
    fireEvent.click(dialog().getByRole('button', { name: a.remove }));
    await waitFor(() =>
      expect(owner.setFleetDisplayValueFn).toHaveBeenLastCalledWith({
        data: {
          projectKey: 'web',
          field: 'lane',
          value: 'Search',
          approved: false,
        },
      })
    );
  });
});

// The compiler passes a root-relative filename and `<name>_createServerFn_handler`.
describe('Owner server functions', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, 'owner-api.ts'),
    'utf8'
  );
  const exported = [
    ...source.matchAll(/export const (\w+) = createServerFn/g),
  ].map((match) => match[1] as string);

  it('are never pinned for grantees', () => {
    expect(exported.sort()).toEqual(Object.keys(owner).sort());
    for (const name of exported) {
      expect(FLEET_SERVER_FUNCTIONS as readonly string[]).not.toContain(name);
      expect(
        fleetServerFunctionId({
          filename: 'src/fleet-access/owner-api.ts',
          functionName: `${name}_createServerFn_handler`,
        })
      ).toBeUndefined();
    }
  });

  it('read only the owner identity', () => {
    expect(source).toContain('currentOwner().token');
    expect(source).not.toContain('currentFleetActor');
  });
});
