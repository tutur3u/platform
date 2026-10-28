import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskPropertyNameRow } from './task-property-row';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('TaskPropertyNameRow', () => {
  it('names the property beside its value in the Details list', () => {
    render(
      <TaskPropertyNameRow popoverId="projects" variant="embedded">
        <button type="button">Platform</button>
      </TaskPropertyNameRow>
    );
    expect(
      screen.getByText('ws-task-boards.dialog.field.projects')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Platform' })
    ).toBeInTheDocument();
  });

  it('renders the control alone outside the Details list', () => {
    render(
      <TaskPropertyNameRow popoverId="projects" variant="compact">
        <button type="button">Platform</button>
      </TaskPropertyNameRow>
    );
    expect(
      screen.queryByText('ws-task-boards.dialog.field.projects')
    ).not.toBeInTheDocument();
  });

  it('keeps the priority icon on its value, not beside its name', () => {
    const { container } = render(
      <TaskPropertyNameRow popoverId="priority" variant="embedded">
        <button type="button">Critical</button>
      </TaskPropertyNameRow>
    );
    expect(container.querySelector('span > svg')).toBeNull();
  });
});
