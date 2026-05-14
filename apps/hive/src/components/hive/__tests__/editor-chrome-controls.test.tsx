import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorChromeControls } from '../editor-chrome-controls';

describe('EditorChromeControls', () => {
  it('toggles collapsed editor chrome from section-local handles', () => {
    const onToggleLeft = vi.fn();
    const onToggleRight = vi.fn();
    const onToggleTop = vi.fn();
    const onToggleBottom = vi.fn();
    const onToggleNpcLab = vi.fn();

    const { rerender } = render(
      <EditorChromeControls
        bottomCollapsed
        npcLabCollapsed={true}
        onToggleBottom={onToggleBottom}
        onToggleNpcLab={onToggleNpcLab}
        onToggleRight={onToggleRight}
        onToggleTop={onToggleTop}
        rightCollapsed
        topCollapsed={false}
      />
    );

    fireEvent.click(screen.getByTitle('Toggle inspector'));
    fireEvent.click(screen.getByTitle('Toggle NPC lab'));
    fireEvent.click(screen.getByTitle('Toggle tool dock'));

    rerender(
      <EditorChromeControls
        bottomCollapsed={false}
        npcLabCollapsed={false}
        onToggleBottom={onToggleBottom}
        onToggleNpcLab={onToggleNpcLab}
        onToggleRight={onToggleRight}
        onToggleTop={onToggleTop}
        rightCollapsed={false}
        topCollapsed
      />
    );
    fireEvent.click(screen.getByTitle('Toggle top panels'));

    expect(onToggleLeft).not.toHaveBeenCalled();
    expect(onToggleRight).toHaveBeenCalledOnce();
    expect(onToggleTop).toHaveBeenCalledOnce();
    expect(onToggleNpcLab).toHaveBeenCalledOnce();
    expect(onToggleBottom).toHaveBeenCalledOnce();
  });
});
