/**
 * @vitest-environment jsdom
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Dialog, DialogContent } from '@tuturuuu/ui/dialog';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompactTaskCreatePopover } from './compact-task-create-popover';
import { CompactTaskDescriptionPreview } from './compact-task-description-preview';
import { QuickCreatePropertyChips } from './quick-create/quick-create-property-chips';
import { isTaskSaveShortcutHandled } from './quick-create/quick-create-shortcut';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('../../create-list-dialog', () => ({
  CreateListDialog: () => null,
}));

const Q = 'ws-task-boards.dialog.quick_create';
const CREATE = 'ws-task-boards.dialog.create_task';

type PanelProps = ComponentProps<typeof CompactTaskCreatePopover>;
type ChipProps = ComponentProps<typeof QuickCreatePropertyChips>;

function renderChips(overrides: Partial<ChipProps> = {}) {
  const lists = [
    { id: 'list-1', name: 'In Progress', status: 'active', position: 0 },
  ] as unknown as TaskList[];
  return (
    <QuickCreatePropertyChips
      wsId="ws-1"
      boardId="board-1"
      locale="en"
      priority={null}
      startDate={undefined}
      endDate={undefined}
      estimationPoints={null}
      selectedLabels={[]}
      selectedProjects={[]}
      selectedListId="list-1"
      selectedAssignees={[]}
      isPersonalWorkspace={false}
      availableLists={lists}
      availableLabels={[]}
      taskProjects={[]}
      workspaceMembers={[]}
      onPriorityChange={vi.fn()}
      onStartDateChange={vi.fn()}
      onEndDateChange={vi.fn()}
      onEstimationChange={vi.fn()}
      onLabelToggle={vi.fn()}
      onProjectToggle={vi.fn()}
      onListChange={vi.fn()}
      onAssigneeToggle={vi.fn()}
      onQuickDueDate={vi.fn()}
      onShowNewLabelDialog={vi.fn()}
      onShowNewProjectDialog={vi.fn()}
      onShowEstimationConfigDialog={vi.fn()}
      {...overrides}
    />
  );
}

function createProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    title: 'Create task',
    contextLabel: 'Fleet backlog',
    titleInput: (
      <textarea aria-label="Task title" defaultValue="Draft compact title" />
    ),
    propertyControls: (
      <button type="button" aria-label="Priority: High">
        Priority
      </button>
    ),
    saveAsDraft: false,
    createMultiple: false,
    canSave: true,
    isLoading: false,
    onSaveAsDraftChange: vi.fn(),
    onCreateMultipleChange: vi.fn(),
    onClose: vi.fn(),
    onFullscreen: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props = createProps(overrides);
  render(
    <Dialog open={true}>
      <CompactTaskCreatePopover {...props} />
    </Dialog>
  );
  return props;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CompactTaskCreatePopover', () => {
  it('renders the context chip, expand and close in the header', () => {
    renderPanel();

    expect(screen.getByTestId('compact-task-dialog-panel')).toBeTruthy();
    expect(screen.getByText('Create task')).toHaveClass('sr-only');
    expect(screen.getByTestId('compact-task-context')).toHaveTextContent(
      'Fleet backlog'
    );
    expect(
      screen.getByLabelText('ws-task-boards.dialog.enlarge_dialog')
    ).toBeTruthy();
    expect(screen.getByLabelText('common.close')).toBeTruthy();
    expect(screen.getByLabelText('Task title')).toHaveProperty(
      'value',
      'Draft compact title'
    );
  });

  it('keeps smart suggestions and other secondary actions out of the compact dialog', () => {
    renderPanel();
    const panel = screen.getByTestId('compact-task-dialog-panel');

    expect(within(panel).queryByText(/smart/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/template/i)).not.toBeInTheDocument();
    expect(
      within(panel).queryByLabelText(/smart|template|settings/i)
    ).not.toBeInTheDocument();
  });

  it('routes footer actions to the caller while keeping form nodes mounted', () => {
    const props = renderPanel();

    fireEvent.click(
      screen.getByLabelText('ws-task-boards.dialog.enlarge_dialog')
    );
    fireEvent.click(screen.getByRole('button', { name: `${Q}.save_draft` }));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: CREATE }));

    expect(props.onFullscreen).toHaveBeenCalledTimes(1);
    expect(props.onSaveAsDraftChange).toHaveBeenCalledWith(true);
    expect(props.onCreateMultipleChange).toHaveBeenCalledWith(true);
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Task title')).toHaveProperty(
      'value',
      'Draft compact title'
    );
    expect(screen.getByLabelText('Priority: High')).toBeTruthy();
  });

  it('labels the create more switch and shows Tab, Esc and Ctrl+Enter hints', () => {
    renderPanel();
    const footer = screen.getByTestId('quick-create-footer');

    expect(screen.getByLabelText(`${Q}.create_more`)).toHaveAttribute(
      'role',
      'switch'
    );
    expect(footer).toHaveTextContent(`Tab${Q}.next_hint`);
    expect(footer).toHaveTextContent(`Esc${Q}.close_hint`);
    expect(
      within(screen.getByRole('button', { name: CREATE })).getByText('Ctrl')
    ).toBeTruthy();
  });

  it('disables create when the dialog cannot save', () => {
    const props = renderPanel({ canSave: false });
    const saveButton = screen.getByRole('button', { name: CREATE });

    expect(saveButton).toHaveProperty('disabled', true);
    fireEvent.click(saveButton);

    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('reflects draft and create-more toggled states', () => {
    renderPanel({ createMultiple: true, saveAsDraft: true });

    expect(
      screen.getByRole('button', { name: `${Q}.save_draft` })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('button', { name: 'task-drafts.save_as_draft' })
    ).toBeTruthy();
  });

  it.each([
    ['Cmd+Enter', { metaKey: true }],
    ['Ctrl+Enter', { ctrlKey: true }],
  ])('creates the task on %s and marks the press handled', (_, modifier) => {
    const props = renderPanel();
    const handled: boolean[] = [];
    const listener = (event: KeyboardEvent) =>
      handled.push(isTaskSaveShortcutHandled(event));
    window.addEventListener('keydown', listener);

    fireEvent.keyDown(screen.getByLabelText('Task title'), {
      key: 'Enter',
      ...modifier,
    });
    window.removeEventListener('keydown', listener);

    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(handled).toEqual([true]);
  });

  it('ignores the create shortcut without a modifier or when saving is blocked', () => {
    const props = renderPanel({ canSave: false });
    const title = screen.getByLabelText('Task title');

    fireEvent.keyDown(title, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(title, { key: 'Enter' });

    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('closes the dialog on Escape from the focused title', () => {
    const onOpenChange = vi.fn();
    // The real title input focuses itself on open. Without that, the dialog's
    // focus trap lands on Expand, which opens its tooltip, and the first
    // Escape correctly dismisses that tooltip layer instead of the dialog.
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <CompactTaskCreatePopover
            {...createProps({
              titleInput: <textarea aria-label="Task title" autoFocus />,
            })}
          />
        </DialogContent>
      </Dialog>
    );
    const title = screen.getByLabelText('Task title');

    expect(document.activeElement).toBe(title);
    fireEvent.keyDown(title, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lifts the phone sheet above the on-screen keyboard', () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 800,
      offsetTop: 0,
    });
    const original = window.visualViewport;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });

    try {
      render(
        <Dialog open={true}>
          <DialogContent>
            <CompactTaskCreatePopover {...createProps()} />
          </DialogContent>
        </Dialog>
      );
      const sheet = document.querySelector<HTMLElement>(
        '[data-slot="dialog-content"]'
      );
      const inset = () =>
        sheet?.style.getPropertyValue('--quick-create-keyboard-inset');

      expect(inset()).toBe('0px');

      act(() => {
        viewport.height = 460;
        viewport.dispatchEvent(new Event('resize'));
      });
      expect(inset()).toBe('340px');

      act(() => {
        viewport.offsetTop = 40;
        viewport.dispatchEvent(new Event('scroll'));
      });
      expect(inset()).toBe('300px');
    } finally {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: original,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it('renders the optional description line and writes plain text back', () => {
    const onTaskDescriptionChange = vi.fn();
    renderPanel({ taskDescription: null, onTaskDescriptionChange });

    fireEvent.change(screen.getByLabelText(`${Q}.add_description`), {
      target: { value: 'First line' },
    });

    expect(onTaskDescriptionChange).toHaveBeenCalledWith({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First line' }] },
      ],
    });
  });

  it('disables the description line with the other controls', () => {
    renderPanel({
      taskDescription: null,
      onTaskDescriptionChange: vi.fn(),
      disabled: true,
    });

    expect(screen.getByLabelText(`${Q}.add_description`)).toBeDisabled();
  });

  it('wraps property controls in a wrapping row for compact edit', () => {
    renderPanel();

    expect(screen.getByLabelText('Priority: High').parentElement).toHaveClass(
      'flex',
      'flex-wrap',
      'items-center',
      'gap-1.5'
    );
  });

  it('saves once on Cmd+Enter in an open picker without picking its item', () => {
    const onLabelToggle = vi.fn();
    const props = renderPanel({
      propertyControls: renderChips({
        availableLabels: [
          { id: 'label-ci', name: 'ci', color: 'blue', created_at: '' },
        ],
        onLabelToggle,
      }),
    });

    fireEvent.click(
      document.querySelector('[data-quick-create-chip="labels"]') as Element
    );
    const search = screen.getByPlaceholderText(`${Q}.search`);
    fireEvent.keyDown(search, { key: 'Enter', metaKey: true });

    expect(onLabelToggle).not.toHaveBeenCalled();
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByPlaceholderText(`${Q}.search`)
    ).not.toBeInTheDocument();
  });

  it('moves focus title, description, then each property chip in order', () => {
    renderPanel({
      taskDescription: null,
      onTaskDescriptionChange: vi.fn(),
      propertyControls: renderChips(),
    });

    const panel = screen.getByTestId('compact-task-dialog-panel');
    const tabbable = Array.from(
      panel.querySelectorAll<HTMLElement>('button, textarea, input')
    ).filter(
      (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1
    );
    const order = tabbable.map(
      (element) =>
        element.getAttribute('data-quick-create-chip') ??
        element.getAttribute('aria-label')
    );
    const titleIndex = order.indexOf('Task title');
    const chipOrder = order.slice(titleIndex + 2, titleIndex + 10);

    expect(titleIndex).toBeGreaterThan(-1);
    expect(order[titleIndex + 1]).toBe(`${Q}.add_description`);
    expect(chipOrder).toEqual([
      'list',
      'priority',
      'start',
      'due',
      'estimate',
      'labels',
      'project',
      'assignees',
    ]);
  });

  it('renders compact edit actions without create-only footer actions', () => {
    const onDelete = vi.fn();
    render(
      <Dialog open={true}>
        <CompactTaskCreatePopover
          title="Edit task"
          titleInput={<input aria-label="Task title" defaultValue="Existing" />}
          propertyControls={
            <button type="button" aria-label="List: Inbox">
              List
            </button>
          }
          editActions={
            <button
              type="button"
              aria-label="common.delete_task"
              onClick={onDelete}
            >
              Delete
            </button>
          }
          onClose={vi.fn()}
          onFullscreen={vi.fn()}
        />
      </Dialog>
    );

    fireEvent.click(screen.getByLabelText('common.delete_task'));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Edit task')).toHaveClass('sr-only');
    expect(screen.getByLabelText('List: Inbox')).toBeTruthy();
    expect(screen.queryByTestId('quick-create-footer')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: CREATE })
    ).not.toBeInTheDocument();
  });

  it('renders the compact description preview below the panel', () => {
    const onDescriptionPreviewClick = vi.fn();

    render(
      <Dialog open={true}>
        <CompactTaskCreatePopover
          title="Edit task"
          titleInput={<input aria-label="Task title" defaultValue="Existing" />}
          propertyControls={null}
          descriptionPreview="Confirm the plan and publish the final notes."
          descriptionPreviewLabel="Open full task"
          onDescriptionPreviewClick={onDescriptionPreviewClick}
          onClose={vi.fn()}
          onFullscreen={vi.fn()}
        />
      </Dialog>
    );

    const preview = screen.getByTestId('compact-task-description-preview');

    expect(preview).toHaveTextContent(
      'Confirm the plan and publish the final notes.'
    );
    expect(preview).toHaveAttribute('aria-label', 'Open full task');
    expect(preview).toHaveClass('absolute', 'top-full');

    fireEvent.click(preview);

    expect(onDescriptionPreviewClick).toHaveBeenCalledTimes(1);
  });

  it('renders legacy Markdown semantically in the compact quick view', () => {
    render(
      <Dialog open={true}>
        <CompactTaskCreatePopover
          title="Edit task"
          titleInput={<input aria-label="Task title" defaultValue="Existing" />}
          propertyControls={null}
          descriptionPreview={
            <CompactTaskDescriptionPreview
              content={{
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: '# Release notes\n\n- Keep the compact editor',
                      },
                    ],
                  },
                ],
              }}
            />
          }
          descriptionPreviewLabel="Open full task"
          onDescriptionPreviewClick={vi.fn()}
          onClose={vi.fn()}
          onFullscreen={vi.fn()}
        />
      </Dialog>
    );

    const preview = screen.getByTestId('compact-task-description-preview');
    expect(preview.querySelector('h1')).toHaveTextContent('Release notes');
    expect(preview.querySelector('li')).toHaveTextContent(
      'Keep the compact editor'
    );
    expect(preview).not.toHaveTextContent('# Release notes');
  });

  it('omits the description preview and line when the caller provides neither', () => {
    renderPanel();

    expect(
      screen.queryByTestId('compact-task-description-preview')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(`${Q}.add_description`)
    ).not.toBeInTheDocument();
  });
});
