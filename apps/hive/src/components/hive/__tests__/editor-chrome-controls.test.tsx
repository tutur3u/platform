import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorChromeControls } from '../editor-chrome-controls';

describe('EditorChromeControls', () => {
  it('toggles editor panels from one compact control rail', () => {
    const onToggleLeft = vi.fn();
    const onToggleRight = vi.fn();
    const onToggleTop = vi.fn();
    const onToggleBottom = vi.fn();
    const onToggleNpcLab = vi.fn();

    render(
      <EditorChromeControls
        bottomCollapsed={false}
        leftCollapsed={false}
        npcLabCollapsed={true}
        onToggleBottom={onToggleBottom}
        onToggleLeft={onToggleLeft}
        onToggleNpcLab={onToggleNpcLab}
        onToggleRight={onToggleRight}
        onToggleTop={onToggleTop}
        rightCollapsed={false}
        topCollapsed={false}
      />
    );

    fireEvent.click(screen.getByTitle('Toggle server sidebar'));
    fireEvent.click(screen.getByTitle('Toggle inspector'));
    fireEvent.click(screen.getByTitle('Toggle top panels'));
    fireEvent.click(screen.getByTitle('Toggle NPC lab'));
    fireEvent.click(screen.getByTitle('Toggle tool dock'));

    expect(onToggleLeft).toHaveBeenCalledOnce();
    expect(onToggleRight).toHaveBeenCalledOnce();
    expect(onToggleTop).toHaveBeenCalledOnce();
    expect(onToggleNpcLab).toHaveBeenCalledOnce();
    expect(onToggleBottom).toHaveBeenCalledOnce();
  });
});
