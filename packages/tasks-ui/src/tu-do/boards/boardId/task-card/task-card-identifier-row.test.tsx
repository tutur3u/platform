import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getTaskCardSelectionIconToneClasses } from './task-card-checkbox-style';
import { TaskCardIdentifierRow } from './task-card-identifier-row';

vi.mock('@tuturuuu/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('TaskCardIdentifierRow', () => {
  it('renders the selection checkbox before the external source', () => {
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
        selectionCheckboxClassName={getTaskCardSelectionIconToneClasses('BLUE')}
        taskListStatus="active"
      />
    );

    const source = screen.getByTestId('task-card-external-source');
    const checkboxControl = screen.getByTestId('task-card-selection-checkbox');
    const checkbox = screen.getByRole('checkbox', {
      name: 'Select Draft response',
    });

    expect(checkboxControl.compareDocumentPosition(source)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.queryByTestId('task-card-ticket-identifier')).toBeNull();
    expect(checkboxControl).toHaveClass(
      'border-dynamic-blue/70',
      'bg-dynamic-blue/5'
    );
    expect(checkboxControl).not.toHaveClass('border-0', 'bg-transparent');
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByTestId('task-card-selection-icon')).toBeNull();
    expect(checkboxControl).not.toHaveClass('absolute');
    expect(checkboxControl).not.toHaveClass('bg-background/80');
    expect(
      screen.getAllByTestId('tooltip-content').map((node) => node.textContent)
    ).toEqual(['Select task', 'Upskii / Roadmap / Review']);

    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('uses the SquareCheck icon for the selected state', () => {
    render(
      <TaskCardIdentifierRow
        documentLabel="Document"
        externalSourceLabel="Source"
        isMultiSelectMode
        isPersonalExternalTask={false}
        isSelected
        selectTaskLabel="Select task"
        selectionCheckboxClassName={getTaskCardSelectionIconToneClasses('RED')}
        taskListStatus="active"
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Select task' });

    expect(checkbox).toBeChecked();
    const checkboxControl = screen.getByTestId('task-card-selection-checkbox');
    const selectionIcon = screen.getByTestId('task-card-selection-icon');

    expect(checkboxControl).toHaveAttribute('data-selected', 'true');
    expect(checkboxControl).toHaveClass('size-4');
    expect(checkboxControl).toHaveClass(
      'border-0',
      'bg-transparent',
      'shadow-none'
    );
    expect(selectionIcon).toBeVisible();
    expect(selectionIcon).toHaveClass('size-4');
  });

  it('renders only the selection checkbox for an internal task', () => {
    render(
      <TaskCardIdentifierRow
        documentLabel="Document"
        externalSourceLabel="Source"
        isMultiSelectMode
        isPersonalExternalTask={false}
        isSelected={false}
        selectTaskLabel="Select task"
        selectionCheckboxClassName={getTaskCardSelectionIconToneClasses(
          'GREEN'
        )}
        taskListStatus="active"
      />
    );

    expect(
      screen.getByTestId('task-card-selection-checkbox')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('task-card-external-source')).toBeNull();
    expect(screen.queryByTestId('task-card-ticket-identifier')).toBeNull();
  });

  it('keeps document selection and compact badges on one row', () => {
    render(
      <TaskCardIdentifierRow
        documentLabel="Document"
        externalSourceLabel="Exocorpse"
        externalSourceTitle="Exocorpse / Web"
        isMultiSelectMode
        isPersonalExternalTask
        isSelected={false}
        selectTaskLabel="Select task"
        selectionCheckboxClassName={getTaskCardSelectionIconToneClasses(
          'PURPLE'
        )}
        taskListStatus="documents"
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

  it('renders nothing for a plain task outside multi-select mode', () => {
    const { container } = render(
      <TaskCardIdentifierRow
        documentLabel="Document"
        externalSourceLabel="Source"
        isMultiSelectMode={false}
        isPersonalExternalTask={false}
        isSelected={false}
        selectTaskLabel="Select task"
        taskListStatus="active"
      />
    );

    // The ticket ID now prefixes the card title instead of sitting here.
    expect(container).toBeEmptyDOMElement();
  });
});
