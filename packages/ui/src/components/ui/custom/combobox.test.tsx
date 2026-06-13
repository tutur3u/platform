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
});
