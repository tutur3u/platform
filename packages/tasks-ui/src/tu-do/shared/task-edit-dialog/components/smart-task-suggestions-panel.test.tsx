/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceTaskSuggestionTask } from '@tuturuuu/internal-api/tasks';
import { describe, expect, it, vi } from 'vitest';
import {
  SmartTaskSuggestionsButton,
  SmartTaskSuggestionsPanel,
} from './smart-task-suggestions-panel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

const baseSuggestion: WorkspaceTaskSuggestionTask = {
  id: 'suggestion-1',
  title: 'Prepare launch checklist',
  description: 'Confirm owners and deadlines.',
  priority: 'high',
  listId: 'list-1',
  listName: 'Inbox',
  labelIds: ['label-1'],
  labels: [
    {
      id: 'label-1',
      name: 'Launch',
      color: 'blue',
      created_at: '2026-06-11T00:00:00.000Z',
    },
  ],
  projectIds: ['project-1'],
  projects: [{ id: 'project-1', name: 'Website', status: 'active' }],
  endDate: '2026-06-12T16:59:59.000Z',
  estimationPoints: 3,
  durationMinutes: 90,
  isSplittable: true,
  minSplitDurationMinutes: 30,
  maxSplitDurationMinutes: 60,
  calendarHours: 'work_hours',
  autoSchedule: true,
  reason: 'Launch work with a deadline.',
};

describe('SmartTaskSuggestionsPanel', () => {
  it('renders loading state from the sparkle button and panel', () => {
    render(
      <>
        <SmartTaskSuggestionsButton isLoading={true} onClick={vi.fn()} />
        <SmartTaskSuggestionsPanel
          suggestions={[]}
          selectedSuggestionIds={[]}
          isLoading={true}
          onApplyFirst={vi.fn()}
          onApplySuggestion={vi.fn()}
          onClose={vi.fn()}
          onCreateSelected={vi.fn()}
          onRetry={vi.fn()}
          onToggleSuggestion={vi.fn()}
        />
      </>
    );

    expect(screen.getByLabelText('smart_suggest')).toBeDisabled();
    expect(screen.getByText('smart_generating')).toBeInTheDocument();
  });

  it('applies a single suggestion without creating it immediately', () => {
    const onApplySuggestion = vi.fn();

    render(
      <SmartTaskSuggestionsPanel
        suggestions={[baseSuggestion]}
        selectedSuggestionIds={['suggestion-1']}
        onApplyFirst={vi.fn()}
        onApplySuggestion={onApplySuggestion}
        onClose={vi.fn()}
        onCreateSelected={vi.fn()}
        onRetry={vi.fn()}
        onToggleSuggestion={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'smart_apply_suggestion' })
    );

    expect(onApplySuggestion).toHaveBeenCalledWith(baseSuggestion);
    expect(
      screen.queryByRole('button', { name: /smart_create_selected/ })
    ).not.toBeInTheDocument();
  });

  it('creates selected tasks from multiple suggestions', () => {
    const onCreateSelected = vi.fn();
    const onToggleSuggestion = vi.fn();
    const secondSuggestion = {
      ...baseSuggestion,
      id: 'suggestion-2',
      title: 'Draft launch note',
    };

    render(
      <SmartTaskSuggestionsPanel
        suggestions={[baseSuggestion, secondSuggestion]}
        selectedSuggestionIds={['suggestion-1']}
        onApplyFirst={vi.fn()}
        onApplySuggestion={vi.fn()}
        onClose={vi.fn()}
        onCreateSelected={onCreateSelected}
        onRetry={vi.fn()}
        onToggleSuggestion={onToggleSuggestion}
      />
    );

    fireEvent.click(screen.getAllByLabelText('smart_select_suggestion')[1]!);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'smart_create_selected:{"count":1}',
      })
    );

    expect(onToggleSuggestion).toHaveBeenCalledWith('suggestion-2');
    expect(onCreateSelected).toHaveBeenCalledTimes(1);
  });
});
