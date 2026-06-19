/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueGreenMonitoringRecoverySettings } from './blue-green-monitoring-recovery-settings';

const mocks = vi.hoisted(() => ({
  updateBlueGreenDockerRecoverySettings: vi.fn(),
}));

vi.mock(
  '@tuturuuu/internal-api/infrastructure/monitoring',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@tuturuuu/internal-api/infrastructure/monitoring')
      >();

    return {
      ...actual,
      updateBlueGreenDockerRecoverySettings:
        mocks.updateBlueGreenDockerRecoverySettings,
    };
  }
);

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const messages: Record<string, string> = {
  'recovery_settings.badge': 'Docker Recovery',
  'recovery_settings.command_timeout': 'Command timeout (ms)',
  'recovery_settings.description':
    'Tune the host supervisor restart timing and Docker crash alert behavior.',
  'recovery_settings.email_alerts_enabled': 'Email Docker crash alerts',
  'recovery_settings.email_cooldown': 'Email alert cooldown (ms)',
  'recovery_settings.email_recipients': 'Alert recipients',
  'recovery_settings.email_recipients_placeholder':
    'ops@example.com, founder@example.com',
  'recovery_settings.no_timeout': 'No timeout',
  'recovery_settings.poll': 'Docker poll interval (ms)',
  'recovery_settings.restart_after': 'Restart after unavailable (ms)',
  'recovery_settings.restart_cooldown': 'Restart cooldown (ms)',
  'recovery_settings.restart_disabled': 'Disable Docker restart attempts',
  'recovery_settings.save': 'Save Recovery Settings',
  'recovery_settings.save_error': 'Could not save Docker recovery settings.',
  'recovery_settings.save_success': 'Saved Docker recovery settings.',
  'recovery_settings.saving': 'Saving Settings',
  'recovery_settings.timeout': 'Docker recovery timeout (ms)',
  'recovery_settings.title': 'Host-level recovery settings',
  'recovery_settings.updated': 'Last updated {time}',
  'states.none': 'None',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const template = messages[key] ?? key;

    return Object.entries(values ?? {}).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, replacement),
      template
    );
  },
}));

function createSnapshot() {
  return {
    control: {
      dockerRecoverySettings: {
        dockerRecoveryPollMs: 5000,
        dockerRecoveryTimeoutMs: null,
        dockerRestartAfterMs: 30_000,
        dockerRestartCommand: null,
        dockerRestartCooldownMs: 300_000,
        dockerRestartDisabled: false,
        emailAlertCooldownMs: 1_800_000,
        emailAlertRecipients: [],
        emailAlertsEnabled: false,
        kind: 'docker-recovery-settings',
        postRestartCommandTimeoutMs: 600_000,
        postRestartCommands: [],
        updatedAt: null,
        updatedBy: null,
        updatedByEmail: null,
      },
    },
  } as unknown as BlueGreenMonitoringSnapshot;
}

function renderSettings(snapshot = createSnapshot()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BlueGreenMonitoringRecoverySettings snapshot={snapshot} />
    </QueryClientProvider>
  );
}

describe('BlueGreenMonitoringRecoverySettings', () => {
  beforeEach(() => {
    mocks.updateBlueGreenDockerRecoverySettings.mockReset();
  });

  it('starts collapsed and keeps save disabled until a setting changes', () => {
    renderSettings();

    expect(
      screen.queryByLabelText('Restart after unavailable (ms)')
    ).not.toBeInTheDocument();

    const saveButton = screen.getByRole('button', {
      name: /Save Recovery Settings/i,
    });
    expect(saveButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Host-level recovery settings/i,
      })
    );

    const restartAfterInput = screen.getByLabelText(
      'Restart after unavailable (ms)'
    );
    expect(restartAfterInput).toBeInTheDocument();

    fireEvent.change(restartAfterInput, { target: { value: '45000' } });

    expect(saveButton).toBeEnabled();

    fireEvent.change(restartAfterInput, { target: { value: '30000' } });

    expect(saveButton).toBeDisabled();
  });
});
