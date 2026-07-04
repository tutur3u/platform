import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Combobox } from './combobox';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const options = [
  { label: 'Alpha', value: 'alpha' },
  { label: 'Beta', value: 'beta' },
];

function openCombobox() {
  fireEvent.click(screen.getByRole('combobox'));
}

describe('Combobox', () => {
  it('shows create row when the query has no exact normalized match', () => {
    render(
      <Combobox
        createText="Create"
        onCreate={vi.fn()}
        options={options}
        placeholder="Pick item"
        searchPlaceholder="Search items"
        selected=""
      />
    );

    openCombobox();
    fireEvent.change(screen.getByPlaceholderText('Search items'), {
      target: { value: 'Alph' },
    });

    expect(screen.getByText('Alph')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search items'), {
      target: { value: 'Alpha' },
    });

    expect(screen.queryByText('Create')).not.toBeInTheDocument();
  });

  it('prevents duplicate async creates and selects returned options', async () => {
    const onChange = vi.fn();
    let resolveCreate:
      | ((value: { label: string; value: string }) => void)
      | undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<{ label: string; value: string }>((resolve) => {
          resolveCreate = resolve;
        })
    );

    render(
      <Combobox
        creatingText="Creating"
        createText="Create"
        onChange={onChange}
        onCreate={onCreate}
        options={options}
        placeholder="Pick item"
        searchPlaceholder="Search items"
        selected=""
      />
    );

    openCombobox();
    fireEvent.change(screen.getByPlaceholderText('Search items'), {
      target: { value: 'Gamma' },
    });

    fireEvent.click(screen.getByText('Gamma'));
    fireEvent.click(screen.getByText('Gamma'));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Creating')).toBeInTheDocument();

    resolveCreate?.({ label: 'Gamma', value: 'gamma' });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('gamma'));
  });

  it('selects returned string values from create callbacks', async () => {
    const onChange = vi.fn();

    render(
      <Combobox
        createText="Create"
        onChange={onChange}
        onCreate={() => 'delta'}
        options={options}
        placeholder="Pick item"
        searchPlaceholder="Search items"
        selected=""
      />
    );

    openCombobox();
    fireEvent.change(screen.getByPlaceholderText('Search items'), {
      target: { value: 'Delta' },
    });
    fireEvent.click(screen.getByText('Delta'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('delta'));
  });

  it('keeps action rendering backward compatible', () => {
    const onSelect = vi.fn();

    render(
      <Combobox
        actions={[
          {
            key: 'manage',
            label: 'Manage options',
            onSelect,
          },
        ]}
        options={options}
        placeholder="Pick item"
        selected=""
      />
    );

    openCombobox();
    fireEvent.click(screen.getByText('Manage options'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('can hide the selected trigger icon while keeping option icons visible', () => {
    render(
      <Combobox
        options={[
          {
            label: 'Alpha',
            value: 'alpha',
            icon: <span data-testid="alpha-option-icon">A</span>,
          },
          { label: 'Beta', value: 'beta' },
        ]}
        placeholder="Pick item"
        selected="alpha"
        showSelectedIcon={false}
      />
    );

    expect(screen.queryByTestId('alpha-option-icon')).not.toBeInTheDocument();

    openCombobox();

    expect(screen.getByTestId('alpha-option-icon')).toBeInTheDocument();
  });

  it('can use a stable trigger icon while preserving option row icons', () => {
    render(
      <Combobox
        ariaLabel="View picker"
        hideTriggerLabel
        options={[
          {
            label: 'Kanban',
            value: 'kanban',
            icon: <span data-testid="kanban-option-icon">K</span>,
          },
        ]}
        placeholder="Pick view"
        selected="kanban"
        showChevron={false}
        triggerIcon={<span data-testid="stable-view-icon">V</span>}
        triggerMode="compact"
      />
    );

    expect(screen.getByTestId('stable-view-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-option-icon')).not.toBeInTheDocument();

    openCombobox();

    expect(screen.getByTestId('kanban-option-icon')).toBeInTheDocument();
  });

  it('supports compact accessible icon-only triggers with wider popover content', () => {
    render(
      <Combobox
        ariaLabel="Compact picker"
        contentWidth="md"
        hideTriggerLabel
        label={<span>Alpha compact</span>}
        options={[
          {
            label: 'Alpha',
            value: 'alpha',
            icon: <span data-testid="alpha-compact-icon">A</span>,
          },
        ]}
        placeholder="Pick item"
        selected="alpha"
        showChevron={false}
        triggerMode="compact"
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Compact picker' });
    expect(trigger).toHaveClass('aspect-square', 'px-0');
    expect(screen.queryByText('Alpha compact')).not.toBeInTheDocument();
    expect(screen.getByTestId('alpha-compact-icon')).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(document.querySelector('[data-slot="popover-content"]')).toHaveClass(
      'w-80'
    );
  });

  it('shows trigger tooltips instantly for compact controls', async () => {
    render(
      <Combobox
        ariaLabel="Compact picker"
        hideTriggerLabel
        options={options}
        placeholder="Pick item"
        selected="alpha"
        showChevron={false}
        triggerMode="compact"
        triggerTooltip="Current: Alpha"
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Compact picker' });
    fireEvent.focus(trigger);

    await waitFor(() => {
      expect(trigger).toHaveAttribute('data-state', 'instant-open');
    });
    expect(screen.getAllByText('Current: Alpha').length).toBeGreaterThan(0);
  });

  it('can keep compact trigger icons monochrome while option rows keep semantic colors', () => {
    render(
      <Combobox
        ariaLabel="Priority picker"
        colorizeTriggerIcon={false}
        hideTriggerLabel
        options={[
          {
            color: '#f97316',
            icon: <span data-testid="priority-icon">P</span>,
            label: 'High priority',
            value: 'high',
          },
        ]}
        placeholder="Pick item"
        selected="high"
        showChevron={false}
        triggerMode="compact"
      />
    );

    const triggerIcon = screen.getByTestId('priority-icon');
    expect(triggerIcon).not.toHaveAttribute('style');

    openCombobox();

    const [, optionIcon] = screen.getAllByTestId('priority-icon');
    expect(optionIcon).toHaveStyle({ color: '#f97316' });
  });

  it('reports popover open changes when the trigger opens and a single option closes it', async () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <Combobox
        onChange={onChange}
        onOpenChange={onOpenChange}
        options={options}
        placeholder="Pick item"
        selected=""
      />
    );

    openCombobox();

    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByText('Beta'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('beta');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders grouped options and non-clipped descriptions', () => {
    render(
      <Combobox
        options={[
          {
            description: 'Detailed board view with enough room to wrap.',
            group: 'Views',
            label: 'Kanban board',
            value: 'kanban',
          },
          {
            description: 'Sort by due date from earliest to latest.',
            group: 'Sorting',
            label: 'Soonest first',
            value: 'due-date-asc',
          },
        ]}
        placeholder="Pick item"
        selected="kanban"
      />
    );

    openCombobox();

    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Sorting')).toBeInTheDocument();
    expect(
      screen.getByText('Detailed board view with enough room to wrap.')
    ).toHaveClass('whitespace-normal', 'break-words');
  });
});
