import { fireEvent, render, screen } from '@testing-library/react';
import {
  EASY_CENTER_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { describe, expect, it, vi } from 'vitest';
import { TutoringShiftRulesEditor } from './tutoring-shift-rules-editor';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: any) =>
    values
      ? `translated_${key}_${JSON.stringify(values)}`
      : `translated_${key}`,
}));

describe('TutoringShiftRulesEditor', () => {
  const samplePolicy: TutoringPolicy = {
    ...EASY_CENTER_TUTORING_POLICY,
    timeRules: [
      {
        label: 'Weekend Shift',
        classStartTime: '08:00',
        classEndTime: '10:00',
        tutoringStartTime: '10:30',
        durationMinutes: 45,
        weekdays: [0, 6],
        classWeekdays: [0],
      },
    ],
  };

  it('renders section title, time inputs, and weekday toggles', () => {
    render(
      <TutoringShiftRulesEditor
        canConfigure={true}
        onChange={vi.fn()}
        policy={samplePolicy}
      />
    );

    expect(
      screen.getByText('translated_policy_exceptions')
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Weekend Shift')).toBeInTheDocument();
    expect(screen.getByDisplayValue('08:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10:30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
  });

  it('shows empty message when timeRules is empty', () => {
    render(
      <TutoringShiftRulesEditor
        canConfigure={true}
        onChange={vi.fn()}
        policy={{ ...samplePolicy, timeRules: [] }}
      />
    );

    expect(
      screen.getByText('translated_policy_no_exceptions')
    ).toBeInTheDocument();
  });

  it('adds an exception rule when add button is clicked', () => {
    const onChange = vi.fn();
    render(
      <TutoringShiftRulesEditor
        canConfigure={true}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const addBtn = screen.getByRole('button', {
      name: 'translated_policy_add_exception',
    });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalled();
    const callArg = onChange.mock.calls[0]![0];
    expect(callArg.timeRules).toHaveLength(2);
    expect(callArg.timeRules[1]).toEqual({
      weekdays: [0, 6],
      classStartTime: '08:00',
      tutoringStartTime: '09:30',
      durationMinutes: 60,
    });
  });

  it('removes an exception rule when remove button is clicked', () => {
    const onChange = vi.fn();
    render(
      <TutoringShiftRulesEditor
        canConfigure={true}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const removeBtn = screen.getByRole('button', {
      name: 'translated_policy_remove_exception',
    });
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        timeRules: [],
      })
    );
  });

  it('updates rule label and time values on input change', () => {
    const onChange = vi.fn();
    render(
      <TutoringShiftRulesEditor
        canConfigure={true}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const labelInput = screen.getByDisplayValue('Weekend Shift');
    fireEvent.change(labelInput, { target: { value: 'Saturday Shift' } });

    expect(onChange).toHaveBeenCalled();
    const updatedRule = onChange.mock.calls[0]![0].timeRules[0];
    expect(updatedRule.label).toBe('Saturday Shift');
  });

  it('toggles weekday buttons', () => {
    const onChange = vi.fn();
    render(
      <TutoringShiftRulesEditor
        canConfigure={true}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    // Click Monday (day 1) in tutoring days
    const mondayButtons = screen.getAllByRole('button', {
      name: 'translated_policy_weekday_1',
    });
    fireEvent.click(mondayButtons[1]!);

    expect(onChange).toHaveBeenCalled();
    const updatedRule = onChange.mock.calls[0]![0].timeRules[0];
    expect(updatedRule.weekdays).toContain(1);
  });

  it('disables inputs and hides action buttons when canConfigure is false', () => {
    render(
      <TutoringShiftRulesEditor
        canConfigure={false}
        onChange={vi.fn()}
        policy={samplePolicy}
      />
    );

    expect(screen.getByDisplayValue('Weekend Shift')).toBeDisabled();
    expect(screen.getByDisplayValue('08:00')).toBeDisabled();
    expect(
      screen.queryByRole('button', {
        name: 'translated_policy_add_exception',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'translated_policy_remove_exception',
      })
    ).not.toBeInTheDocument();
  });
});
