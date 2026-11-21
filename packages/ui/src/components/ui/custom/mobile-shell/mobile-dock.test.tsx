import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileDock } from './mobile-dock';

const items = [
  { key: 'home', label: 'Home', icon: <svg />, href: '/ws', active: true },
  { key: 'tasks', label: 'Tasks', icon: <svg />, href: '/ws/tasks' },
  { key: 'apps', label: 'Apps', icon: <svg />, onSelect: vi.fn() },
];

describe('MobileDock', () => {
  it('marks the active destination and renders links and buttons', () => {
    render(<MobileDock label="Main navigation" items={items} />);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toHaveAttribute('data-slot', 'mobile-dock');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Tasks' })).not.toHaveAttribute(
      'aria-current'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
    expect(items[2]!.onSelect).toHaveBeenCalled();
  });

  it('keeps a single full-width pill without a browser back control', () => {
    const { container } = render(<MobileDock label="Nav" items={items} />);
    const nav = screen.getByRole('navigation');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(
      container.querySelector('[data-slot="mobile-dock-back-lane"]')
    ).toBeNull();
    expect(nav).toHaveAttribute('data-slot', 'mobile-dock');
    expect(
      container.querySelector('[data-slot="mobile-dock-pill"]')
    ).toBeTruthy();
    expect(nav).not.toHaveAttribute('data-has-back');
  });

  it('shows icons only and names every destination', () => {
    render(<MobileDock label="Nav" items={items} />);
    const nav = screen.getByRole('navigation');
    expect(nav).not.toHaveTextContent(/Home|Tasks|Apps/);
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute(
      'aria-label',
      'Tasks'
    );
    expect(screen.getByRole('button', { name: 'Apps' })).toHaveAttribute(
      'aria-label',
      'Apps'
    );
  });

  it('keeps at most five destinations', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      key: `k${i}`,
      label: `Item ${i}`,
      icon: <svg />,
      href: `/${i}`,
    }));
    render(<MobileDock label="Nav" items={many} />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });
});
