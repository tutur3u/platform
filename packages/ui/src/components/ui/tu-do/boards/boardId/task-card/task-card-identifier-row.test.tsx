import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskCardIdentifierRow } from './task-card-identifier-row';

describe('TaskCardIdentifierRow', () => {
  it('renders the selection checkbox inline before the task identifier', () => {
    const onSelect = vi.fn();

    render(
      <TaskCardIdentifierRow
        externalSourceLabel="Upskii"
        externalSourceTitle="Upskii / Roadmap / Review"
        isMultiSelectMode
        isPersonalExternalTask
        isSelected={false}
        onSelect={onSelect}
        selectTaskLabel="Select Draft response"
        taskListStatus="active"
        ticketBadgeClassName="text-dynamic-blue"
        ticketIdentifier="OH-167"
        ticketTitle="Task OH-167"
      />
    );

    const source = screen.getByTestId('task-card-external-source');
    const checkbox = screen.getByTestId('task-card-selection-checkbox');
    const ticket = screen.getByTestId('task-card-ticket-identifier');

    expect(source.compareDocumentPosition(checkbox)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(checkbox.compareDocumentPosition(ticket)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(checkbox).not.toHaveClass('absolute');

    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('omits the selector outside multi-select mode', () => {
    render(
      <TaskCardIdentifierRow
        externalSourceLabel="Source"
        isMultiSelectMode={false}
        isPersonalExternalTask={false}
        isSelected={false}
        selectTaskLabel="Select task"
        taskListStatus="active"
        ticketIdentifier="OH-174"
        ticketTitle="Task OH-174"
      />
    );

    expect(screen.queryByTestId('task-card-selection-checkbox')).toBeNull();
    expect(screen.getByTestId('task-card-ticket-identifier')).toHaveTextContent(
      'OH-174'
    );
  });
});
