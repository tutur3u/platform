import { fireEvent, render, screen } from '@testing-library/react';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TutoringGroupShifts,
  tutoringShiftLabels,
} from './tutoring-group-shifts';

const state = vi.hoisted(() => ({
  combobox: null as any,
  selects: [] as any[],
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { label?: string }) =>
    values?.label ? `${key}:${values.label}` : key,
}));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    state.combobox = props;
    return null;
  },
}));
// Radix Select needs browser APIs jsdom lacks; expose its props instead.
vi.mock('@tuturuuu/ui/select', () => ({
  Select: (props: any) => {
    state.selects.push(props);
    return <div>{props.children}</div>;
  },
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <span data-value={value}>{children}</span>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
}));

const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
const rule = (label?: string) => ({
  ...EASY_CENTER_TUTORING_POLICY.timeRules[0],
  label,
});
const policyWith = (labels: (string | undefined)[], shiftByGroupId = {}) =>
  ({
    ...EASY_CENTER_TUTORING_POLICY,
    timeRules: labels.map(rule),
    shiftByGroupId,
  }) as never;

describe('tutoringShiftLabels', () => {
  it.each([
    [
      ['A', 'B'],
      ['A', 'B'],
    ],
    [
      ['A', ' A ', 'B'],
      ['A', 'B'],
    ],
    [['A', '', '  ', undefined], ['A']],
    [[], []],
  ])('%j -> %j', (input, expected) => {
    expect(tutoringShiftLabels(policyWith(input))).toEqual(expected);
  });
});

describe('TutoringGroupShifts', () => {
  beforeEach(() => {
    state.combobox = null;
    state.selects = [];
  });
  const groups = [
    { id: G1, name: 'English A' },
    { id: G2, name: '' },
  ] as never[];

  it('lists assignments, flags unknown shifts, and reassigns', () => {
    const onChange = vi.fn();
    render(
      <TutoringGroupShifts
        canConfigure
        groups={groups}
        onChange={onChange}
        policy={policyWith(['Morning'], { [G1]: 'Gone', [G2]: 'Morning' })}
      />
    );
    expect(screen.getByText('English A')).toBeTruthy();
    expect(screen.getByText('policy_group_shift_unknown:Gone')).toBeTruthy();
    state.selects[0].onValueChange('Morning');
    expect(onChange).toHaveBeenCalledWith({
      shiftByGroupId: { [G1]: 'Morning', [G2]: 'Morning' },
    });
  });

  it('falls back to the id for an unknown group and removes an assignment', () => {
    const onChange = vi.fn();
    render(
      <TutoringGroupShifts
        canConfigure
        groups={[]}
        onChange={onChange}
        policy={policyWith(['Morning'], { [G1]: 'Morning' })}
      />
    );
    expect(screen.getByText(G1)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'policy_remove_group_shift' })
    );
    expect(onChange).toHaveBeenCalledWith({ shiftByGroupId: {} });
  });

  it('offers only unassigned groups and assigns the first shift', () => {
    const onChange = vi.fn();
    render(
      <TutoringGroupShifts
        canConfigure
        groups={groups}
        onChange={onChange}
        policy={policyWith(['Morning', 'Evening'], { [G1]: 'Evening' })}
      />
    );
    expect(state.combobox.options).toEqual([{ label: G2, value: G2 }]);
    state.combobox.onChange(G2);
    expect(onChange).toHaveBeenCalledWith({
      shiftByGroupId: { [G1]: 'Evening', [G2]: 'Morning' },
    });
  });

  it.each([
    ['read-only', false, ['Morning'], 0],
    ['no named shift', true, [], 1],
  ])(
    'hides editing controls when %s',
    (_name, canConfigure, labels, buttons) => {
      render(
        <TutoringGroupShifts
          canConfigure={canConfigure}
          groups={groups}
          onChange={vi.fn()}
          policy={policyWith(labels, { [G1]: 'Morning' })}
        />
      );
      expect(state.combobox).toBeNull();
      expect(screen.queryAllByRole('button')).toHaveLength(buttons);
    }
  );
});
