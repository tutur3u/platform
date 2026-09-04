import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LabelProjectFilter } from '../label-project-filter';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('LabelProjectFilter catalog demand', () => {
  function renderFilter() {
    const onLabelsRequested = vi.fn();
    const onProjectsRequested = vi.fn();
    render(
      <LabelProjectFilter
        labels={[]}
        projects={[]}
        selectedLabelIds={[]}
        selectedProjectIds={[]}
        onSelectedLabelIdsChange={vi.fn()}
        onSelectedProjectIdsChange={vi.fn()}
        onLabelsRequested={onLabelsRequested}
        onProjectsRequested={onProjectsRequested}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    return { onLabelsRequested, onProjectsRequested };
  }

  it('requests labels only when the label selector opens', () => {
    const { onLabelsRequested, onProjectsRequested } = renderFilter();

    fireEvent.click(screen.getByText('filter_labels'));

    expect(onLabelsRequested).toHaveBeenCalledOnce();
    expect(onProjectsRequested).not.toHaveBeenCalled();
  });

  it('requests projects only when the project selector opens', () => {
    const { onLabelsRequested, onProjectsRequested } = renderFilter();

    fireEvent.click(screen.getByText('filter_projects'));

    expect(onProjectsRequested).toHaveBeenCalledOnce();
    expect(onLabelsRequested).not.toHaveBeenCalled();
  });
});
