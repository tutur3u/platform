import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PomodoroSettings } from '../../types';
import { PomodoroSettingsDialog } from '../pomodoro-settings-dialog';

// Mock UI components
vi.mock('@tuturuuu/ui/button', () => ({
  Button: (props: any) => <button {...props} />,
}));

vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  DialogContent: (props: any) => <div {...props} />,
  DialogHeader: (props: any) => <div {...props} />,
  DialogTitle: (props: any) => <div {...props} />,
  DialogDescription: (props: any) => <div {...props} />,
}));

vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@tuturuuu/ui/label', () => ({
  Label: (props: any) => <label {...props} />,
}));

vi.mock('@tuturuuu/ui/switch', () => ({
  Switch: (props: any) => <button role="switch" {...props} />,
}));

vi.mock('@tuturuuu/icons', () => ({
  Icon: (props: any) => <div {...props} />,
  fruit: 'fruit-icon',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const defaultSettings: PomodoroSettings = {
  focusTime: 25,
  shortBreakTime: 5,
  longBreakTime: 15,
  sessionsUntilLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  enableNotifications: true,
  enable2020Rule: false,
  enableMovementReminder: false,
};

describe('PomodoroSettingsDialog', () => {
  it('renders correctly when open', () => {
    render(
      <PomodoroSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        defaultSettings={defaultSettings}
      />
    );

    expect(screen.getByText('pomodoro_settings_title')).toBeDefined();
    expect(screen.getByText('save_settings')).toBeDefined();
  });

  it('calls onSettingsChange when inputs change', () => {
    const onSettingsChange = vi.fn();
    render(
      <PomodoroSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        defaultSettings={defaultSettings}
      />
    );

    // Find the focus time input (first input of type number)
    const inputs = screen.getAllByRole('spinbutton'); // spinbutton is role for input type=number
    fireEvent.change(inputs[0]!, { target: { value: '30' } });

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        focusTime: 30,
      })
    );
  });
});
