/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailsSection } from './task-details-section';

const mocks = vi.hoisted(() => ({ selfManaged: true }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./hooks/use-task-overrides', () => ({
  useTaskOverrides: () => ({
    override: { self_managed: mocks.selfManaged },
  }),
}));

function renderSection(
  overrides: Partial<Parameters<typeof TaskDetailsSection>[0]> = {}
) {
  return render(
    <TaskDetailsSection
      assigneeCount={0}
      labelCount={0}
      personal={<div data-testid="personal-panel" />}
      properties={<div data-testid="properties-panel" />}
      relationshipCount={0}
      relationships={<div data-testid="relationships-panel" />}
      {...overrides}
    />
  );
}

describe('TaskDetailsSection', () => {
  beforeEach(() => {
    mocks.selfManaged = true;
  });

  it('collapses everything behind a single disclosure', () => {
    renderSection();

    const toggles = screen.getAllByRole('button', { expanded: false });
    expect(toggles).toHaveLength(1);
    expect(toggles[0]).toHaveTextContent('ws-task-boards.dialog.details');
    expect(screen.queryByTestId('properties-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('personal-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('relationships-panel')).not.toBeInTheDocument();
  });

  it('summarizes the task while collapsed', () => {
    renderSection({
      assigneeCount: 2,
      estimationPoints: 5,
      labelCount: 3,
      priority: 'high',
      relationshipCount: 4,
    });

    const header = screen.getByRole('button', { expanded: false });
    expect(header).toHaveTextContent('tasks.priority_high');
    expect(header).toHaveTextContent('5');
    expect(header).toHaveTextContent('3');
    expect(header).toHaveTextContent('2');
    expect(header).toHaveTextContent('4');
    // The personal override is surfaced without opening anything.
    expect(header).toHaveTextContent('ws-tasks.self_managed');
  });

  it('tells the user when there is nothing to summarize', () => {
    mocks.selfManaged = false;
    renderSection();

    expect(
      screen.getByText('ws-task-boards.dialog.details_empty')
    ).toBeInTheDocument();
  });

  it('opens on the properties tab and switches between groups', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByTestId('properties-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('relationships-panel')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('tab', { name: /ws-task-boards.dialog.relationships/ })
    );

    expect(screen.getByTestId('relationships-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('properties-panel')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('tab', { name: /ws-tasks.personal_overrides/ })
    );

    expect(screen.getByTestId('personal-panel')).toBeInTheDocument();
  });

  it('opens straight to relationships when one is being seeded', () => {
    renderSection({ defaultTab: 'relationships' });

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByTestId('relationships-panel')).toBeInTheDocument();
  });

  it('drops tabs the dialog does not offer', () => {
    renderSection({ personal: undefined, relationships: undefined });

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByTestId('properties-panel')).toBeInTheDocument();
  });
});
