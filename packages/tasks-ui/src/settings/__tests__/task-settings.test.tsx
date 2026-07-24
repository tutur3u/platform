/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickSettingsPopover } from '../../tu-do/shared/task-edit-dialog/components/quick-settings-popover';
import { TaskSettings } from '../task-settings';

const {
  mockSetSoundEffectsEnabled,
  mockUpdateUserConfigMutate,
  mockConfigState,
} = vi.hoisted(() => ({
  mockSetSoundEffectsEnabled: vi.fn(),
  mockUpdateUserConfigMutate: vi.fn(),
  mockConfigState: {
    dialogPresentation: 'compact',
    soundEffectsEnabled: true,
    soundEffectsVolume: '35',
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: (configId: string, defaultValue = false) => {
    if (configId === 'TASK_SOUND_EFFECTS_ENABLED') {
      return {
        isLoading: false,
        isPending: false,
        setValue: mockSetSoundEffectsEnabled,
        toggle: vi.fn(),
        value: mockConfigState.soundEffectsEnabled,
      };
    }

    return {
      isLoading: false,
      isPending: false,
      setValue: vi.fn(),
      toggle: vi.fn(),
      value: defaultValue,
    };
  },
  useUserConfig: (configId: string, defaultValue = '') => ({
    data:
      configId === 'TASK_SOUND_EFFECTS_VOLUME'
        ? mockConfigState.soundEffectsVolume
        : configId === 'TASK_DIALOG_DEFAULT_PRESENTATION'
          ? mockConfigState.dialogPresentation
          : defaultValue,
    isLoading: false,
  }),
  useUpdateUserConfig: () => ({
    isPending: false,
    mutate: mockUpdateUserConfigMutate,
  }),
}));

function renderWithQueryClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('task sound settings controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigState.dialogPresentation = 'compact';
    mockConfigState.soundEffectsEnabled = true;
    mockConfigState.soundEffectsVolume = '35';
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({
              fade_completed_tasks: false,
              task_auto_assign_to_self: false,
            }),
          ok: true,
        })
      )
    );
  });

  it('renders task settings sound controls and persists the switch value', async () => {
    renderWithQueryClient(<TaskSettings />);

    expect(await screen.findByText('sound_effects')).toBeInTheDocument();
    expect(screen.getByText('sound_effects_volume')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'sound_effects' }));

    expect(mockSetSoundEffectsEnabled).toHaveBeenCalledWith(false);
  });

  it('renders task dialog presentation setting and persists immersive mode', async () => {
    renderWithQueryClient(<TaskSettings />);

    expect(await screen.findByText('dialog_presentation')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('combobox', { name: 'dialog_presentation' })
    );
    fireEvent.click(screen.getByText('dialog_presentation_immersive'));

    expect(mockUpdateUserConfigMutate).toHaveBeenCalledWith({
      configId: 'TASK_DIALOG_DEFAULT_PRESENTATION',
      value: 'fullscreen',
    });
  });

  it('persists focused mode as the balanced task dialog preference', async () => {
    renderWithQueryClient(<TaskSettings />);

    fireEvent.click(
      await screen.findByRole('combobox', { name: 'dialog_presentation' })
    );
    fireEvent.click(screen.getByText('dialog_presentation_focused'));

    expect(mockUpdateUserConfigMutate).toHaveBeenCalledWith({
      configId: 'TASK_DIALOG_DEFAULT_PRESENTATION',
      value: 'focused',
    });
  });

  it('renders the quick settings sound switch and persists changes', async () => {
    renderWithQueryClient(<QuickSettingsPopover />);

    const trigger = screen.getByRole('button', { name: 'Quick Settings' });

    await waitFor(() => {
      expect(trigger).not.toBeDisabled();
    });

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText('sound_effects')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch', { name: 'sound_effects' }));

    expect(mockSetSoundEffectsEnabled).toHaveBeenCalledWith(false);
  });
});
