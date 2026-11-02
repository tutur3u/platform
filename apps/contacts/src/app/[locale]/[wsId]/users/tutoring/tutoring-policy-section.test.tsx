import { fireEvent, render, screen } from '@testing-library/react';
import {
  EASY_CENTER_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { describe, expect, it, vi } from 'vitest';
import {
  type PolicySectionId,
  TutoringPolicySection,
} from './tutoring-policy-section';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated_${key}`,
}));

describe('TutoringPolicySection', () => {
  const sampleGroups: UserGroup[] = [
    { id: 'group-1', name: 'Lớp 10A' },
  ] as UserGroup[];

  const samplePolicy: TutoringPolicy = {
    ...EASY_CENTER_TUTORING_POLICY,
    parentMessageTemplate: 'Dear parent, tutoring update: {student}',
    weakContentReviewDays: 14,
    restrictWeakContentEditors: true,
    groupExclusions: [
      {
        scope: 'all',
        match: 'contains',
        value: 'FastTrack',
      },
    ],
    supportGroupIds: ['group-1'],
    shiftByGroupId: {
      'group-1': 'Evening Shift',
    },
    campusOptions: ['District 1'],
    campusByGroupId: {
      'group-1': 'District 1',
    },
    tutorGroupIds: ['group-1'],
  };

  it('renders summary mode with title, edit button, and preset details', () => {
    const onEdit = vi.fn();
    render(
      <TutoringPolicySection
        canConfigure={true}
        changed={false}
        editing={null}
        groups={sampleGroups}
        id="presets"
        onCancel={vi.fn()}
        onEdit={onEdit}
        onSave={vi.fn()}
        pending={false}
        policy={samplePolicy}
        valid={true}
      >
        <div>Editor Form</div>
      </TutoringPolicySection>
    );

    expect(screen.getByText('translated_policy_presets')).toBeInTheDocument();
    expect(
      screen.getByText('translated_policy_easy_center')
    ).toBeInTheDocument();

    const editBtn = screen.getByRole('button', {
      name: 'translated_policy_edit',
    });
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith('presets');
  });

  it('renders timing summary with duration and numeric metrics', () => {
    render(
      <TutoringPolicySection
        canConfigure={true}
        changed={false}
        editing={null}
        groups={sampleGroups}
        id="timing"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        onSave={vi.fn()}
        pending={false}
        policy={samplePolicy}
        valid={true}
      >
        <div>Editor Form</div>
      </TutoringPolicySection>
    );

    expect(screen.getByText('translated_policy_timing')).toBeInTheDocument();
    expect(
      screen.getByText('translated_policy_durationMinutes')
    ).toBeInTheDocument();
  });

  it('renders weak rules summary with review days and group exclusions', () => {
    render(
      <TutoringPolicySection
        canConfigure={true}
        changed={false}
        editing={null}
        groups={sampleGroups}
        id="weak"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        onSave={vi.fn()}
        pending={false}
        policy={samplePolicy}
        valid={true}
      >
        <div>Editor Form</div>
      </TutoringPolicySection>
    );

    expect(
      screen.getByText(/translated_policy_weakContentReviewDays: 14/)
    ).toBeInTheDocument();
    expect(screen.getByText(/FastTrack/)).toBeInTheDocument();
  });

  it('renders parent message template summary', () => {
    render(
      <TutoringPolicySection
        canConfigure={true}
        changed={false}
        editing={null}
        groups={sampleGroups}
        id="message"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        onSave={vi.fn()}
        pending={false}
        policy={samplePolicy}
        valid={true}
      >
        <div>Editor Form</div>
      </TutoringPolicySection>
    );

    expect(
      screen.getByText('Dear parent, tutoring update: {student}')
    ).toBeInTheDocument();
  });

  it('disables edit button when another section is active', () => {
    render(
      <TutoringPolicySection
        canConfigure={true}
        changed={false}
        editing={'timing' as PolicySectionId}
        groups={sampleGroups}
        id="presets"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        onSave={vi.fn()}
        pending={false}
        policy={samplePolicy}
        valid={true}
      >
        <div>Editor Form</div>
      </TutoringPolicySection>
    );

    expect(
      screen.getByRole('button', { name: 'translated_policy_edit' })
    ).toBeDisabled();
  });

  it('hides edit button when canConfigure is false', () => {
    render(
      <TutoringPolicySection
        canConfigure={false}
        changed={false}
        editing={null}
        groups={sampleGroups}
        id="presets"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        onSave={vi.fn()}
        pending={false}
        policy={samplePolicy}
        valid={true}
      >
        <div>Editor Form</div>
      </TutoringPolicySection>
    );

    expect(
      screen.queryByRole('button', { name: 'translated_policy_edit' })
    ).not.toBeInTheDocument();
  });

  it('renders children, Cancel, and Save buttons when active', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <TutoringPolicySection
        canConfigure={true}
        changed={true}
        editing="presets"
        groups={sampleGroups}
        id="presets"
        onCancel={onCancel}
        onEdit={vi.fn()}
        onSave={onSave}
        pending={false}
        policy={samplePolicy}
        valid={true}
      >
        <div data-testid="editor-children">Active Content</div>
      </TutoringPolicySection>
    );

    expect(screen.getByTestId('editor-children')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', {
      name: 'translated_policy_save',
    });
    const cancelBtn = screen.getByRole('button', {
      name: 'translated_policy_cancel',
    });

    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalled();

    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables save button when not changed or not valid', () => {
    render(
      <TutoringPolicySection
        canConfigure={true}
        changed={false}
        editing="presets"
        groups={sampleGroups}
        id="presets"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        onSave={vi.fn()}
        pending={false}
        policy={samplePolicy}
        valid={true}
      >
        <div>Editor Content</div>
      </TutoringPolicySection>
    );

    expect(
      screen.getByRole('button', { name: 'translated_policy_save' })
    ).toBeDisabled();
  });
});
