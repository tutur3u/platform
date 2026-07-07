import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Structure } from './structure';

describe('Structure', () => {
  it('removes sidebar chrome and desktop padding when the sidebar is hidden', () => {
    const { container } = render(
      <Structure
        isCollapsed
        setIsCollapsed={vi.fn()}
        mobileHeader={<span>Mobile header</span>}
        sidebarContent={<span>Sidebar content</span>}
        sidebarHeader={<span>Sidebar header</span>}
        sidebarHidden
      >
        <span>Page content</span>
      </Structure>
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.queryByText('Mobile header')).not.toBeInTheDocument();
    expect(screen.queryByText('Sidebar header')).not.toBeInTheDocument();
    expect(screen.queryByText('Sidebar content')).not.toBeInTheDocument();
    expect(container.querySelector('aside')).not.toBeInTheDocument();
    expect(container.querySelector('nav')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('md:pl-0');
  });
});
