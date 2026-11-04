import { fireEvent, render, screen } from '@testing-library/react';
import {
  EASY_CENTER_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringCampusSettings } from './tutoring-campus-settings';

const { comboboxCalls } = vi.hoisted(() => ({
  comboboxCalls: [] as any[],
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated_${key}`,
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    comboboxCalls.push(props);
    return (
      <div data-testid="mock-combobox" data-placeholder={props.placeholder}>
        {props.onCreate ? (
          <button
            aria-label={`create-${props.placeholder || 'item'}`}
            onClick={() => props.onCreate?.('New Campus Option')}
            type="button"
          />
        ) : null}
        {props.placeholder === 'translated_policy_add_campus' ? (
          <button
            aria-label="select-unmapped-group"
            onClick={() => props.onChange?.('group-2')}
            type="button"
          />
        ) : null}
      </div>
    );
  },
}));

describe('TutoringCampusSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comboboxCalls.length = 0;
  });

  const sampleGroups: UserGroup[] = [
    { id: 'group-1', name: 'Campus Group 1' },
    { id: 'group-2', name: 'Campus Group 2' },
  ] as UserGroup[];

  const samplePolicy: TutoringPolicy = {
    ...EASY_CENTER_TUTORING_POLICY,
    campusOptions: ['Main Campus', 'West Annex'],
    campusByGroupId: {
      'group-1': 'Main Campus',
    },
  };

  it('renders campus options and group mappings', () => {
    render(
      <TutoringCampusSettings
        canConfigure={true}
        groups={sampleGroups}
        onChange={vi.fn()}
        policy={samplePolicy}
      />
    );

    expect(screen.getByText('translated_policy_campuses')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Main Campus')).toBeInTheDocument();
    expect(screen.getByDisplayValue('West Annex')).toBeInTheDocument();
    expect(screen.getByText('Campus Group 1')).toBeInTheDocument();
  });

  it('updates a campus option name', () => {
    const onChange = vi.fn();
    render(
      <TutoringCampusSettings
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const input = screen.getByDisplayValue('West Annex');
    fireEvent.change(input, { target: { value: 'East Annex' } });

    expect(onChange).toHaveBeenCalledWith({
      campusOptions: ['Main Campus', 'East Annex'],
    });
  });

  it('removes a campus option', () => {
    const onChange = vi.fn();
    render(
      <TutoringCampusSettings
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const removeBtns = screen.getAllByRole('button', {
      name: 'translated_policy_remove_campus_option',
    });
    fireEvent.click(removeBtns[1]!);

    expect(onChange).toHaveBeenCalledWith({
      campusOptions: ['Main Campus'],
    });
  });

  it('adds a new empty campus option', () => {
    const onChange = vi.fn();
    render(
      <TutoringCampusSettings
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const addBtn = screen.getByRole('button', {
      name: 'translated_policy_add_campus_option',
    });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledWith({
      campusOptions: ['Main Campus', 'West Annex', ''],
    });
  });

  it('removes a group campus assignment', () => {
    const onChange = vi.fn();
    render(
      <TutoringCampusSettings
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const removeBtn = screen.getByRole('button', {
      name: 'translated_policy_remove_campus',
    });
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith({
      campusByGroupId: {},
    });
  });

  it('adds a group mapping when unmapped group is chosen', () => {
    const onChange = vi.fn();
    render(
      <TutoringCampusSettings
        canConfigure={true}
        groups={sampleGroups}
        onChange={onChange}
        policy={samplePolicy}
      />
    );

    const selectUnmapped = screen.getByRole('button', {
      name: 'select-unmapped-group',
    });
    fireEvent.click(selectUnmapped);

    expect(onChange).toHaveBeenCalledWith({
      campusByGroupId: {
        'group-1': 'Main Campus',
        'group-2': '',
      },
    });
  });

  it('disables inputs and hides configuration buttons when canConfigure is false', () => {
    render(
      <TutoringCampusSettings
        canConfigure={false}
        groups={sampleGroups}
        onChange={vi.fn()}
        policy={samplePolicy}
      />
    );

    expect(screen.getByDisplayValue('Main Campus')).toBeDisabled();
    expect(
      screen.queryByRole('button', {
        name: 'translated_policy_add_campus_option',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'translated_policy_remove_campus_option',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'translated_policy_remove_campus',
      })
    ).not.toBeInTheDocument();
  });
});
