import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Empty } from '../empty';

function Inbox({ className }: { className?: string }) {
  return <svg data-testid="icon" className={className} />;
}

describe('Empty', () => {
  it('renders the icon, title, description and one action', () => {
    render(
      <Empty
        icon={Inbox}
        title="No tasks"
        description="Tasks you create show up here."
        action={<button type="button">New task</button>}
      />
    );

    expect(screen.getByText('No tasks')).toBeInTheDocument();
    expect(
      screen.getByText('Tasks you create show up here.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New task' })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('icon').closest('[data-slot="empty-icon"]')
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('prefers an illustration over the icon circle', () => {
    const { container } = render(
      <Empty
        icon={Inbox}
        illustration={<span data-testid="art" />}
        title="Nothing yet"
      />
    );

    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="empty-icon"]')).toBeNull();
    expect(screen.getByTestId('art')).toBeInTheDocument();
  });

  it('omits the description and action when they are not given', () => {
    const { container } = render(<Empty title="Empty" />);

    expect(
      container.querySelector('[data-slot="empty-description"]')
    ).toBeNull();
    expect(container.querySelector('[data-slot="empty-action"]')).toBeNull();
    expect(container.firstElementChild).not.toHaveAttribute('role');
  });

  it('announces politely and supports compact and dashed layouts', () => {
    const { container } = render(
      <Empty announce compact dashed title="No results" className="my-4" />
    );
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveAttribute('role', 'status');
    expect(root).toHaveAttribute('aria-live', 'polite');
    expect(root.className).toContain('border-dashed');
    expect(root.className).toContain('py-6');
    expect(root.className).toContain('my-4');
  });
});
