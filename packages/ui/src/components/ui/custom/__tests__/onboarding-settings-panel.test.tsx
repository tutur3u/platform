import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingSettingsPanel } from '../onboarding-settings-panel';

const updateProgress = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/onboarding', () => ({
  updateConnectedOnboardingProgress: (...args: unknown[]) =>
    updateProgress(...args),
}));

const originalLocation = window.location;

function setLocation(url: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(url),
  });
}

describe('OnboardingSettingsPanel', () => {
  beforeEach(() => {
    updateProgress.mockReset();
    updateProgress.mockResolvedValue({});
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('replays the guide for the app served on a localhost port', async () => {
    setLocation('http://localhost:7809/en/ws_1/tasks');
    const replay = vi.fn();
    window.addEventListener('tuturuuu:onboarding-replay', replay);

    render(<OnboardingSettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'replay_app' }));

    await waitFor(() => expect(replay).toHaveBeenCalledTimes(1));
    expect(updateProgress).toHaveBeenCalledWith({
      dismissed_at: null,
      replay_app: 'tasks',
    });
    const replayEvent = replay.mock.calls[0]?.[0] as CustomEvent | undefined;
    expect(replayEvent?.detail).toEqual({ appSlug: 'tasks' });
    window.removeEventListener('tuturuuu:onboarding-replay', replay);
  });

  it('restarts the full journey in the welcome flow without opening an app guide', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        assign,
        host: 'localhost:7809',
        origin: 'http://localhost:7809',
        pathname: '/en/ws_1/tasks',
      },
    });

    render(<OnboardingSettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'restart_journey' }));

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({ dismissed_at: null, replay_app: null })
    );
    const target = String(assign.mock.calls[0]?.[0]);
    expect(target).toContain('/onboarding?replay=1');
    expect(target).not.toContain('guide=platform');
  });

  it('tags guidance feedback with the current app', () => {
    setLocation('http://localhost:7809/en/ws_1/tasks');
    const report = vi.fn();
    window.addEventListener('tuturuuu:report-problem-open-intent', report);

    render(<OnboardingSettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'feedback' }));

    const reportEvent = report.mock.calls[0]?.[0] as CustomEvent | undefined;
    expect(reportEvent?.detail).toEqual({ context: 'onboarding:tasks' });
    window.removeEventListener('tuturuuu:report-problem-open-intent', report);
  });
});
