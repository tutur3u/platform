import { render } from '@testing-library/react';
import { useOpenWorkspaceSelectWhenRevealed } from '@tuturuuu/ui/custom/workspace-select-reveal';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SidebarWorkspaceSelectSection } from './sidebar-workspace-select-section';

function RevealProbe() {
  const [open, setOpen] = useState(false);
  useOpenWorkspaceSelectWhenRevealed(true, setOpen);

  return <span data-reveal-state={open ? 'open' : 'closed'} />;
}

describe('SidebarWorkspaceSelectSection', () => {
  it('expands the selector without changing the navigation spacing contract', () => {
    const { container } = render(
      <SidebarWorkspaceSelectSection visible>
        <span>Workspace selector</span>
        <RevealProbe />
      </SidebarWorkspaceSelectSection>
    );

    const section = container.querySelector('[data-sidebar-workspace-select]');

    expect(section?.getAttribute('aria-hidden')).toBe('false');
    expect(section?.getAttribute('data-state')).toBe('open');
    expect(section?.className).toContain('grid-rows-[1fr]');
    expect(section?.className).toContain('pb-2');
    expect(section?.className).toContain('opacity-100');
    expect(section?.hasAttribute('inert')).toBe(false);
    expect((section as HTMLElement | null)?.style.gridTemplateRows).toBe('1fr');
    expect((section as HTMLElement | null)?.style.transitionProperty).toBe(
      'grid-template-rows, opacity, border-color, padding'
    );
    expect(
      container
        .querySelector('[data-reveal-state]')
        ?.getAttribute('data-reveal-state')
    ).toBe('open');
  });

  it('collapses to an invisible and inert zero-height row', () => {
    const { container } = render(
      <SidebarWorkspaceSelectSection visible={false}>
        <span>Workspace selector</span>
      </SidebarWorkspaceSelectSection>
    );

    const section = container.querySelector('[data-sidebar-workspace-select]');

    expect(section?.getAttribute('aria-hidden')).toBe('true');
    expect(section?.getAttribute('data-state')).toBe('closed');
    expect(section?.hasAttribute('inert')).toBe(true);
    expect(section?.className).toContain('pointer-events-none');
    expect(section?.className).toContain('grid-rows-[0fr]');
    expect(section?.className).toContain('pb-0');
    expect(section?.className).toContain('opacity-0');
    expect((section as HTMLElement | null)?.style.gridTemplateRows).toBe('0fr');
    expect((section as HTMLElement | null)?.style.transitionProperty).toBe(
      'grid-template-rows, opacity, border-color, padding'
    );
  });
});
