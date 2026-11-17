import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_DOCK_LONG_PRESS_MS, MobileDock } from './mobile-dock';

const items = [
  { key: 'home', label: 'Home', icon: <svg />, href: '/ws', active: true },
  { key: 'tasks', label: 'Tasks', icon: <svg />, href: '/ws/tasks' },
  { key: 'apps', label: 'Apps', icon: <svg />, onSelect: vi.fn() },
];

afterEach(() => vi.useRealTimers());

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

  it('shows Back only below a root, inside the same frame', () => {
    const { rerender } = render(<MobileDock label="Nav" items={items} />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    const frame = screen.getByRole('navigation');
    const frameClass = frame.className;

    const onBack = vi.fn();
    rerender(
      <MobileDock label="Nav" items={items} back={{ label: 'Back', onBack }} />
    );
    expect(screen.getByRole('navigation')).toBe(frame);
    expect(frame.className).toBe(frameClass);
    expect(frame).toHaveAttribute('data-has-back', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('turns a long press on Back into the root action without also going back', () => {
    vi.useFakeTimers();
    const onBack = vi.fn();
    const onLongPress = vi.fn();
    render(
      <MobileDock
        label="Nav"
        items={items}
        back={{ label: 'Back', onBack, onLongPress }}
      />
    );
    const back = screen.getByRole('button', { name: 'Back' });
    fireEvent.pointerDown(back);
    act(() => vi.advanceTimersByTime(MOBILE_DOCK_LONG_PRESS_MS));
    fireEvent.pointerUp(back);
    fireEvent.click(back);
    expect(onLongPress).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
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
