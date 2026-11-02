import { fireEvent, render, screen } from '@testing-library/react';
import {
  EASY_CENTER_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringWeakRules } from './tutoring-weak-rules';

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
      <button
        aria-label={`mock-combobox-${props.placeholder}`}
        onClick={() => {
          if (props.placeholder === 'translated_policy_scope') {
            props.onChange?.('weak_support');
          } else if (props.placeholder === 'translated_policy_target') {
            props.onChange?.('tag');
          } else if (props.placeholder === 'translated_policy_match') {
            props.onChange?.('exact');
          }
        }}
        type="button"
      >
        {props.selected}
      </button>
    );
  },
}));

describe('TutoringWeakRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comboboxCalls.length = 0;
  });

  const basePolicy: TutoringPolicy = {
    ...EASY_CENTER_TUTORING_POLICY,
    weakContentReviewDays: 14,
    restrictWeakContentEditors: false,
    groupExclusions: [
      {
        scope: 'all',
        target: 'name',
        match: 'contains',
        value: 'Advanced',
      },
    ],
  };

  it('renders weak rules title, inputs, and exclusions', () => {
    render(
      <TutoringWeakRules
        canConfigure={true}
        onChange={vi.fn()}
        policy={basePolicy}
      />
    );

    expect(
      screen.getByText('translated_policy_weak_rules')
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('14')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Advanced')).toBeInTheDocument();
  });

  it('shows empty message when groupExclusions is empty', () => {
    render(
      <TutoringWeakRules
        canConfigure={true}
        onChange={vi.fn()}
        policy={{ ...basePolicy, groupExclusions: [] }}
      />
    );

    expect(
      screen.getByText('translated_policy_no_weak_exclusions')
    ).toBeInTheDocument();
  });

  it('updates weakContentReviewDays on input change', () => {
    const onChange = vi.fn();
    render(
      <TutoringWeakRules
        canConfigure={true}
        onChange={onChange}
        policy={basePolicy}
      />
    );

    const input = screen.getByDisplayValue('14');
    fireEvent.change(input, { target: { value: '21' } });

    expect(onChange).toHaveBeenCalledWith({
      weakContentReviewDays: 21,
    });
  });

  it('toggles restrictWeakContentEditors switch', () => {
    const onChange = vi.fn();
    render(
      <TutoringWeakRules
        canConfigure={true}
        onChange={onChange}
        policy={basePolicy}
      />
    );

    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);

    expect(onChange).toHaveBeenCalledWith({
      restrictWeakContentEditors: true,
    });
  });

  it('adds a new exclusion rule when add button is clicked', () => {
    const onChange = vi.fn();
    render(
      <TutoringWeakRules
        canConfigure={true}
        onChange={onChange}
        policy={basePolicy}
      />
    );

    const addBtn = screen.getByRole('button', {
      name: 'translated_policy_add_weak_exclusion',
    });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledWith({
      groupExclusions: [
        basePolicy.groupExclusions[0],
        { scope: 'all', match: 'contains', value: '' },
      ],
    });
  });

  it('removes an exclusion rule when trash button is clicked', () => {
    const onChange = vi.fn();
    render(
      <TutoringWeakRules
        canConfigure={true}
        onChange={onChange}
        policy={basePolicy}
      />
    );

    const removeBtn = screen.getByRole('button', {
      name: 'translated_policy_remove_weak_exclusion',
    });
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith({
      groupExclusions: [],
    });
  });

  it('updates rule value pattern text', () => {
    const onChange = vi.fn();
    render(
      <TutoringWeakRules
        canConfigure={true}
        onChange={onChange}
        policy={basePolicy}
      />
    );

    const input = screen.getByDisplayValue('Advanced');
    fireEvent.change(input, { target: { value: 'Elite' } });

    expect(onChange).toHaveBeenCalledWith({
      groupExclusions: [
        {
          scope: 'all',
          target: 'name',
          match: 'contains',
          value: 'Elite',
        },
      ],
    });
  });

  it('updates rule scope and match via comboboxes', () => {
    const onChange = vi.fn();
    render(
      <TutoringWeakRules
        canConfigure={true}
        onChange={onChange}
        policy={basePolicy}
      />
    );

    const scopeBtn = screen.getByRole('button', {
      name: 'mock-combobox-translated_policy_scope',
    });
    fireEvent.click(scopeBtn);

    expect(onChange).toHaveBeenCalledWith({
      groupExclusions: [
        {
          scope: 'weak_support',
          target: 'name',
          match: 'contains',
          value: 'Advanced',
        },
      ],
    });
  });

  it('disables controls when canConfigure is false', () => {
    render(
      <TutoringWeakRules
        canConfigure={false}
        onChange={vi.fn()}
        policy={basePolicy}
      />
    );

    expect(screen.getByDisplayValue('14')).toBeDisabled();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByDisplayValue('Advanced')).toBeDisabled();
    expect(
      screen.queryByRole('button', {
        name: 'translated_policy_add_weak_exclusion',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'translated_policy_remove_weak_exclusion',
      })
    ).not.toBeInTheDocument();
  });
});
