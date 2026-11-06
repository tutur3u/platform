import { render } from '@testing-library/react';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringSupportGroups } from './tutoring-support-groups';

const state = vi.hoisted(() => ({ props: null as any }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    state.props = props;
    return null;
  },
}));

const GROUP = '11111111-1111-4111-8111-111111111111';
const DELETED = '22222222-2222-4222-8222-222222222222';

function renderGroups(
  supportGroupIds: string[],
  groups: { id: string; name?: string }[],
  canConfigure = true,
  onChange = vi.fn()
) {
  render(
    <TutoringSupportGroups
      canConfigure={canConfigure}
      groups={groups as never[]}
      onChange={onChange}
      policy={{ ...EASY_CENTER_TUTORING_POLICY, supportGroupIds }}
    />
  );
  return onChange;
}

describe('TutoringSupportGroups', () => {
  beforeEach(() => {
    state.props = null;
  });

  it.each([
    ['named group', [], [{ id: GROUP, name: 'English A' }], 'English A'],
    ['unnamed group falls back to id', [], [{ id: GROUP, name: '' }], GROUP],
  ])('builds options for a %s', (_name, selected, groups, label) => {
    renderGroups(selected, groups);
    expect(state.props.options).toEqual([{ label, value: GROUP }]);
  });

  it('keeps a deleted selected group listed by id', () => {
    renderGroups([DELETED], [{ id: GROUP, name: 'English A' }]);
    expect(state.props.options).toEqual([
      { label: 'English A', value: GROUP },
      { label: DELETED, value: DELETED },
    ]);
    expect(state.props.selected).toEqual([DELETED]);
  });

  it.each([
    [true, false],
    [false, true],
  ])('canConfigure=%s sets disabled=%s', (canConfigure, disabled) => {
    renderGroups([], [], canConfigure);
    expect(state.props.disabled).toBe(disabled);
  });

  it('reports the new selection as supportGroupIds', () => {
    const onChange = renderGroups([], [{ id: GROUP, name: 'A' }]);
    state.props.onChange([GROUP]);
    expect(onChange).toHaveBeenCalledWith({ supportGroupIds: [GROUP] });
  });
});
