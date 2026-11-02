import { fireEvent, render, screen } from '@testing-library/react';
import {
  EASY_CENTER_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TutoringGroupShifts,
  tutoringShiftLabels,
} from './tutoring-group-shifts';

const { comboboxState } = vi.hoisted(() => ({
  comboboxState: { props: null as any },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: any) =>
    values
      ? `translated_${key}_${JSON.stringify(values)}`
      : `translated_${key}`,
}));

vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => (
    <div
      data-testid="select"
      data-value={value}
      data-disabled={Boolean(disabled)}
    >
      {children}
      <button
        aria-label="mock-change-shift"
        onClick={() => onValueChange?.('Evening Shift')}
        type="button"
      />
    </div>
  ),
  SelectTrigger: ({ children, id }: any) => <div id={id}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <div>{placeholder}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value, disabled }: any) => (
    <div data-value={value} data-disabled={Boolean(disabled)}>
      {children}
    </div>
  ),
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    comboboxState.props = props;
    return (
      <button
        data-testid="add-shift-combobox"
        onClick={() => props.onChange?.('group-2')}
        type="button"
      >
        {props.placeholder}
      </button>
    );
  },
}));

describe('tutoringShiftLabels', () => {
  it('extracts, trims, and deduplicates non-empty shift labels', () => {
    const policy: TutoringPolicy = {
      ...EASY_CENTER_TUTORING_POLICY,
      timeRules: [
        {
          weekdays: [1],
          tutoringStartTime: '08:00',
          durationMinutes: 60,
          label: ' Morning Shift ',
        },
        {
          weekdays: [2],
          tutoringStartTime: '14:00',
          durationMinutes: 60,
          label: 'Afternoon Shift',
        },
        {
          weekdays: [3],
          tutoringStartTime: '18:00',
          durationMinutes: 60,
          label: 'Morning Shift',
        },
        {
          weekdays: [4],
          tutoringStartTime: '20:00',
          durationMinutes: 60,
          label: '   ',
        },
        {
          weekdays: [5],
          tutoringStartTime: '21:00',
          durationMinutes: 60,
        },
      ],
    };

    expect(tutoringShiftLabels(policy)).toEqual([
      'Morning Shift',
      'Afternoon Shift',
    ]);
  });
});

describe('TutoringGroupShifts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comboboxState.props = null;
  });

  const sampleGroups: UserGroup[] = [
    { id: 'group-1', name: 'Lớp 10A' },
    { id: 'group-2', name: 'Lớp 11B' },
  ] as UserGroup[];

  const samplePolicy: TutoringPolicy = {
    ...EASY_CENTER_TUTORING_POLICY,
    timeRules: [
      {
        weekdays: [1, 3],
        tutoringStartTime: '08:00',
        durationMinutes: 60,
        label: 'Morning Shift',
      },
      {
        weekdays: [2, 4],
        tutoringStartTime: '18:00',
        durationMinutes: 60,
        label: 'Evening Shift',
      },
    ],
    shiftByGroupId: {
      'group-1': 'Morning Shift',
    },
  };

  it('renders existing group shifts with group names and shift labels', () => {
    render(
      <TutoringGroupShifts
        canConfigure={true}
        groups={sampleGroups}
        onChange={vi.fn()}
        policy={samplePolicy}
      />
    );

    expect(
      screen.getByText('translated_policy_group_shifts')
    ).toBeInTheDocument();
    expect(screen.getByText('Lớp 10A')).toBeInTheDocument();
    expect(screen.getByText('Morning Shift')).toBeInTheDocument();
  });

  it('allows removing a group shift mapping', () => {
    const onChange = vi.fn();
    render(
      <TutoringGroupShifts
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const removeBtn = screen.getByRole('button', {
      name: 'translated_policy_remove_group_shift',
    });
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith({
      shiftByGroupId: {},
    });
  });

  it('allows reassigning a group shift via select', () => {
    const onChange = vi.fn();
    render(
      <TutoringGroupShifts
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const changeBtn = screen.getByRole('button', { name: 'mock-change-shift' });
    fireEvent.click(changeBtn);

    expect(onChange).toHaveBeenCalledWith({
      shiftByGroupId: {
        'group-1': 'Evening Shift',
      },
    });
  });

  it('allows adding a shift to an unassigned group', () => {
    const onChange = vi.fn();
    render(
      <TutoringGroupShifts
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const addCombobox = screen.getByTestId('add-shift-combobox');
    fireEvent.click(addCombobox);

    expect(onChange).toHaveBeenCalledWith({
      shiftByGroupId: {
        'group-1': 'Morning Shift',
        'group-2': 'Morning Shift',
      },
    });
  });

  it('hides remove and add controls when canConfigure is false', () => {
    render(
      <TutoringGroupShifts
        canConfigure={false}
        groups={sampleGroups}
        onChange={vi.fn()}
        policy={samplePolicy}
      />
    );

    expect(
      screen.queryByRole('button', {
        name: 'translated_policy_remove_group_shift',
      })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-shift-combobox')).not.toBeInTheDocument();
  });
});
