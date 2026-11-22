import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useOpenWorkspaceSelectWhenRevealed,
  useWorkspaceSelectSection,
  WorkspaceSelectRevealProvider,
} from '../workspace-select-reveal';

vi.mock('../../../../hooks/use-mobile', () => ({
  useIsMobile: () => window.innerWidth < 768,
}));

function SelectorHarness({
  hasSelectableWorkspaces,
  name = 'selector',
}: {
  hasSelectableWorkspaces: boolean;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  useOpenWorkspaceSelectWhenRevealed(hasSelectableWorkspaces, setOpen);

  return (
    <>
      <output data-testid={`${name}-state`}>{open ? 'open' : 'closed'}</output>
      <button type="button" onClick={() => setOpen(false)}>
        {`Close ${name}`}
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Open selector
      </button>
    </>
  );
}

function Shell({
  hasSelectableWorkspaces = true,
  name = 'selector',
}: {
  hasSelectableWorkspaces?: boolean;
  name?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const section = useWorkspaceSelectSection(collapsed);

  return (
    <>
      <button type="button" onClick={() => setCollapsed((value) => !value)}>
        {`Toggle ${name} sidebar`}
      </button>
      <button
        type="button"
        onClick={() => section.toggle(() => setCollapsed(false))}
      >
        {`Toggle ${name}`}
      </button>
      <WorkspaceSelectRevealProvider
        key={collapsed ? 'rail' : 'panel'}
        openRequest={section.openRequest}
        revealed={section.visible}
      >
        <output data-testid={`${name}-visibility`}>
          {section.visible ? 'shown' : 'hidden'}
        </output>
        <SelectorHarness
          hasSelectableWorkspaces={hasSelectableWorkspaces}
          name={name}
        />
      </WorkspaceSelectRevealProvider>
    </>
  );
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
afterEach(() => vi.unstubAllGlobals());

describe('WorkspaceSelectRevealProvider', () => {
  it('opens on an explicit reveal but not when the visible rail remounts', () => {
    render(<Shell />);

    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    click('Toggle selector');
    expect(screen.getByTestId('selector-state')).toHaveTextContent('open');

    click('Close selector');
    click('Toggle selector sidebar');
    expect(screen.getByTestId('selector-visibility')).toHaveTextContent(
      'shown'
    );
    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    click('Toggle selector sidebar');
    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    click('Toggle selector');
    click('Toggle selector');
    expect(screen.getByTestId('selector-state')).toHaveTextContent('open');
  });

  it('waits for an available workspace before opening', () => {
    const { rerender } = render(<Shell hasSelectableWorkspaces={false} />);

    click('Toggle selector');
    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    rerender(<Shell hasSelectableWorkspaces />);
    expect(screen.getByTestId('selector-state')).toHaveTextContent('open');
  });

  it('cancels a pending open when the mobile drawer closes', () => {
    vi.stubGlobal('innerWidth', 390);
    const { rerender } = render(<Shell hasSelectableWorkspaces={false} />);

    click('Toggle selector sidebar');
    click('Toggle selector');
    expect(screen.getByTestId('selector-visibility')).toHaveTextContent(
      'shown'
    );
    click('Toggle selector sidebar');
    rerender(<Shell hasSelectableWorkspaces />);
    expect(screen.getByTestId('selector-visibility')).toHaveTextContent(
      'hidden'
    );
    click('Toggle selector sidebar');
    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');
  });

  it('targets only the requested sidebar instance', () => {
    render(
      <>
        <Shell name="first" />
        <Shell name="second" />
      </>
    );

    click('Toggle second');

    expect(screen.getByTestId('first-state')).toHaveTextContent('closed');
    expect(screen.getByTestId('second-state')).toHaveTextContent('open');
  });

  it('does not control workspace selectors outside a reveal section', () => {
    const { rerender } = render(
      <SelectorHarness hasSelectableWorkspaces={false} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open selector' }));
    expect(screen.getByTestId('selector-state')).toHaveTextContent('open');

    rerender(<SelectorHarness hasSelectableWorkspaces />);
    expect(screen.getByTestId('selector-state')).toHaveTextContent('open');
  });
});
