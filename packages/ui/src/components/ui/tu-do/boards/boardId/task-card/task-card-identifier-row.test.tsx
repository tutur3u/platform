import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getTaskCardSelectionCheckboxToneClasses } from './task-card-checkbox-style';
import { TaskCardIdentifierRow } from './task-card-identifier-row';

vi.mock('@tuturuuu/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('TaskCardIdentifierRow', () => {
  it('renders the selection checkbox before the external source and task identifier', () => {
    const onSelect = vi.fn();

    render(
      <TaskCardIdentifierRow
        documentLabel="Document"
        externalSourceLabel="Upskii"
        externalSourceTitle="Upskii / Roadmap / Review"
        isMultiSelectMode
        isPersonalExternalTask
        isSelected={false}
        onSelect={onSelect}
        selectTaskLabel="Select Draft response"
        selectTaskTooltipLabel="Select task"
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
    expect(
      screen.getAllByTestId('tooltip-content').map((node) => node.textContent)
    ).toEqual(['Select task', 'Upskii / Roadmap / Review', 'Task OH-167']);

    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders the selection checkbox before an internal task identifier', () => {
    render(
      <TaskCardIdentifierRow
        documentLabel="Document"
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

  it('keeps document selection and compact badges on one row without a ticket id', () => {
    render(
      <TaskCardIdentifierRow
        documentLabel="Document"
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
    const documentType = screen.getByTestId('task-card-document-type');
    const source = screen.getByTestId('task-card-external-source');

    expect(checkbox.compareDocumentPosition(documentType)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(documentType.compareDocumentPosition(source)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.queryByTestId('task-card-ticket-identifier')).toBeNull();
    expect(documentType).toHaveTextContent('Document');
    expect(documentType.className).toBe(source.className);
    expect(documentType).toHaveClass(
      'border-dynamic-cyan/30',
      'bg-dynamic-cyan/10',
      'text-dynamic-cyan'
    );
    expect(source).toHaveClass('h-4', 'px-1', 'text-[9px]');
    expect(
      screen.getAllByTestId('tooltip-content').map((node) => node.textContent)
    ).toEqual(['Select task', 'Document', 'Exocorpse / Web']);
  });

  it('renders linked source breadcrumbs for external tasks', () => {
    render(
      <TaskCardIdentifierRow
        documentLabel="Document"
        externalSourceBreadcrumbs={[
          { href: '/source-workspace', label: 'Exocorpse' },
          { href: '/source-workspace/boards/board-1', label: 'Web' },
          {
            href: '/source-workspace/boards/board-1#task-list-list-1',
            label: 'Review',
          },
        ]}
        externalSourceHref="/source-workspace/boards/board-1#task-list-list-1"
        externalSourceLabel="Exocorpse"
        isMultiSelectMode={false}
        isPersonalExternalTask
        isSelected={false}
        selectTaskLabel="Select task"
        taskListStatus="active"
        ticketIdentifier={null}
        ticketTitle=""
      />
    );

    expect(screen.getByTestId('task-card-external-source')).toHaveAttribute(
      'href',
      '/source-workspace/boards/board-1#task-list-list-1'
    );
    expect(screen.getByRole('link', { name: 'Web' })).toHaveAttribute(
      'href',
      '/source-workspace/boards/board-1'
    );
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/source-workspace/boards/board-1#task-list-list-1'
    );
  });

  it('omits the selector outside multi-select mode', () => {
    render(
      <TaskCardIdentifierRow
        documentLabel="Document"
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
