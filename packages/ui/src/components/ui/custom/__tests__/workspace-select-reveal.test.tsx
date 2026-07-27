import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  useOpenWorkspaceSelectWhenRevealed,
  WorkspaceSelectRevealProvider,
} from '../workspace-select-reveal';

function SelectorHarness({
  hasSelectableWorkspaces,
}: {
  hasSelectableWorkspaces: boolean;
}) {
  const [open, setOpen] = useState(false);
  useOpenWorkspaceSelectWhenRevealed(hasSelectableWorkspaces, setOpen);

  return (
    <>
      <output data-testid="selector-state">{open ? 'open' : 'closed'}</output>
      <button type="button" onClick={() => setOpen(false)}>
        Close selector
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Open selector
      </button>
    </>
  );
}

function TestTree({
  hasSelectableWorkspaces = true,
  revealed,
}: {
  hasSelectableWorkspaces?: boolean;
  revealed: boolean;
}) {
  return (
    <WorkspaceSelectRevealProvider revealed={revealed}>
      <SelectorHarness hasSelectableWorkspaces={hasSelectableWorkspaces} />
    </WorkspaceSelectRevealProvider>
  );
}

describe('WorkspaceSelectRevealProvider', () => {
  it('opens the selector each time its collapsed sidebar section is revealed', () => {
    const { rerender } = render(<TestTree revealed={false} />);

    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    rerender(<TestTree revealed />);
    expect(screen.getByTestId('selector-state')).toHaveTextContent('open');

    fireEvent.click(screen.getByRole('button', { name: 'Close selector' }));
    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    rerender(<TestTree revealed />);
    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    rerender(<TestTree revealed={false} />);
    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    rerender(<TestTree revealed />);
    expect(screen.getByTestId('selector-state')).toHaveTextContent('open');
  });

  it('waits for an available workspace before opening', () => {
    const { rerender } = render(
      <TestTree hasSelectableWorkspaces={false} revealed />
    );

    expect(screen.getByTestId('selector-state')).toHaveTextContent('closed');

    rerender(<TestTree hasSelectableWorkspaces revealed />);
    expect(screen.getByTestId('selector-state')).toHaveTextContent('open');
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
