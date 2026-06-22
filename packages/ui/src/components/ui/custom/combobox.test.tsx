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

  it('supports compact accessible triggers with wider popover content', () => {
    render(
      <Combobox
        ariaLabel="Compact picker"
        contentWidth="md"
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

    expect(
      screen.getByRole('combobox', { name: 'Compact picker' })
    ).toHaveTextContent('Alpha compact');
    expect(screen.getByTestId('alpha-compact-icon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Compact picker' }));

    expect(document.querySelector('[data-slot="popover-content"]')).toHaveClass(
      'w-80'
    );
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
