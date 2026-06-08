import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getTaskCardSelectionCheckboxToneClasses } from './task-card-checkbox-style';
import { TaskCardIdentifierRow } from './task-card-identifier-row';

describe('TaskCardIdentifierRow', () => {
  it('renders the selection checkbox before the external source and task identifier', () => {
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
        selectionCheckboxClassName={getTaskCardSelectionCheckboxToneClasses(
          'BLUE'
        )}
        taskListStatus="active"
        ticketBadgeClassName="text-dynamic-blue"
        ticketIdentifier="OH-167"
        ticketTitle="Task OH-167"
      />
    );

    const source = screen.getByTestId('task-card-external-source');
    const checkbox = screen.getByTestId('task-card-selection-checkbox');
    const ticket = screen.getByTestId('task-card-ticket-identifier');

    expect(checkbox.compareDocumentPosition(source)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(source.compareDocumentPosition(ticket)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(checkbox).toHaveClass('border-dynamic-blue/70');
    expect(checkbox).toHaveClass('bg-dynamic-blue/5');
    expect(checkbox.className).toContain(
      'data-[state=checked]:border-dynamic-blue/70'
    );
    expect(checkbox).not.toHaveClass('absolute');
    expect(checkbox).not.toHaveClass('bg-background/80');

    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders the selection checkbox before an internal task identifier', () => {
    render(
      <TaskCardIdentifierRow
        externalSourceLabel="Source"
        isMultiSelectMode
        isPersonalExternalTask={false}
        isSelected={false}
        selectTaskLabel="Select task"
        selectionCheckboxClassName={getTaskCardSelectionCheckboxToneClasses(
          'GREEN'
        )}
        taskListStatus="active"
        ticketIdentifier="OH-174"
        ticketTitle="Task OH-174"
      />
    );

    const checkbox = screen.getByTestId('task-card-selection-checkbox');
    const ticket = screen.getByTestId('task-card-ticket-identifier');

    expect(checkbox.compareDocumentPosition(ticket)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.queryByTestId('task-card-external-source')).toBeNull();
  });

  it('keeps the selection checkbox first when document lists omit the identifier', () => {
    render(
      <TaskCardIdentifierRow
        externalSourceLabel="Exocorpse"
        externalSourceTitle="Exocorpse / Web"
        isMultiSelectMode
        isPersonalExternalTask
        isSelected={false}
        selectTaskLabel="Select task"
        selectionCheckboxClassName={getTaskCardSelectionCheckboxToneClasses(
          'PURPLE'
        )}
        taskListStatus="documents"
        ticketIdentifier="WEB-54"
        ticketTitle="Task WEB-54"
      />
    );

    const checkbox = screen.getByTestId('task-card-selection-checkbox');
    const source = screen.getByTestId('task-card-external-source');

    expect(checkbox.compareDocumentPosition(source)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.queryByTestId('task-card-ticket-identifier')).toBeNull();
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
