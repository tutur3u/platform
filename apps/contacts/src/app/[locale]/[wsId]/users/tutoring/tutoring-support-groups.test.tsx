import { render, screen } from '@testing-library/react';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringSupportGroups } from './tutoring-support-groups';

const { comboboxState } = vi.hoisted(() => ({
  comboboxState: { props: null as any },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated_${key}`,
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    comboboxState.props = props;
    return (
      <div data-testid="support-groups-combobox">
        {props.disabled ? 'disabled' : 'enabled'}
      </div>
    );
  },
}));

describe('TutoringSupportGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comboboxState.props = null;
  });

  const sampleGroups: UserGroup[] = [
    { id: 'group-1', name: 'Lớp 10A' },
    { id: 'group-2', name: 'Lớp 11B' },
  ] as UserGroup[];

  it('renders section title and description', () => {
    render(
      <TutoringSupportGroups
        canConfigure={true}
        groups={sampleGroups}
        onChange={vi.fn()}
        policy={EASY_CENTER_TUTORING_POLICY}
      />
    );

    expect(
      screen.getByText('translated_policy_support_groups')
    ).toBeInTheDocument();
    expect(
      screen.getByText('translated_policy_support_groups_description')
    ).toBeInTheDocument();
  });

  it('populates options with groups and unknown/deleted support group IDs', () => {
    const policy = {
      ...EASY_CENTER_TUTORING_POLICY,
      supportGroupIds: ['group-1', 'deleted-group-99'],
    };

    render(
      <TutoringSupportGroups
        canConfigure={true}
        groups={sampleGroups}
        onChange={vi.fn()}
        policy={policy}
      />
    );

    expect(comboboxState.props.options).toEqual([
      { label: 'Lớp 10A', value: 'group-1' },
      { label: 'Lớp 11B', value: 'group-2' },
      { label: 'deleted-group-99', value: 'deleted-group-99' },
    ]);
    expect(comboboxState.props.selected).toEqual([
      'group-1',
      'deleted-group-99',
    ]);
    expect(comboboxState.props.disabled).toBe(false);
  });

  it('disables combobox when canConfigure is false', () => {
    render(
      <TutoringSupportGroups
        canConfigure={false}
        groups={sampleGroups}
        onChange={vi.fn()}
        policy={EASY_CENTER_TUTORING_POLICY}
      />
    );

    expect(comboboxState.props.disabled).toBe(true);
  });

  it('calls onChange with new supportGroupIds when combobox triggers onChange', () => {
    const onChange = vi.fn();
    render(
      <TutoringSupportGroups
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={EASY_CENTER_TUTORING_POLICY}
      />
    );

    comboboxState.props.onChange(['group-2']);
    expect(onChange).toHaveBeenCalledWith({
      supportGroupIds: ['group-2'],
    });
  });
});
