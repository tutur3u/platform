import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectChip } from './project-chip';
import { ProjectPicker } from './project-picker';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const labels = {
  placeholder: 'Choose a project',
  search: 'Search projects',
  empty: 'No projects',
  clear: 'No project',
  loading: 'Loading projects',
};

const projects = [
  { id: 'p1', name: 'EduFest' },
  { id: 'p2', name: 'Launch' },
];

describe('ProjectPicker', () => {
  it('shows a loading region instead of an empty list while loading', () => {
    render(
      <ProjectPicker
        labels={labels}
        onChange={vi.fn()}
        state={{ status: 'loading' }}
        value={null}
      />
    );

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Loading projects')).toBeTruthy();
  });

  it('selects a project by id', () => {
    const onChange = vi.fn();
    render(
      <ProjectPicker
        labels={labels}
        onChange={onChange}
        state={{ status: 'ready', projects }}
        value={null}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Launch'));
    expect(onChange).toHaveBeenCalledWith('p2');
  });

  it('clears back to no project', () => {
    const onChange = vi.fn();
    render(
      <ProjectPicker
        labels={labels}
        onChange={onChange}
        state={{ status: 'ready', projects }}
        value="p1"
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('No project'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('ProjectChip', () => {
  it('links to the project and exposes a labelled remove control', () => {
    const onRemove = vi.fn();
    render(
      <ProjectChip
        href="/ws/tasks/projects/p1"
        name="EduFest"
        onRemove={onRemove}
        removeLabel="Unlink EduFest"
      />
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/ws/tasks/projects/p1'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlink EduFest' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
