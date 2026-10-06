import { fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { describe, expect, it, vi } from 'vitest';
import { FixedToolbarContents } from './fixed-toolbar-contents';

vi.mock('./color-controls', () => ({
  TextEditorColorControls: () => <button type="button">Colors</button>,
}));
vi.mock('./copy-menu', () => ({
  EditorCopyMenu: () => <button type="button">Copy tools</button>,
}));

function mount(toolsLabel?: string) {
  const heading = vi.fn();
  const bold = vi.fn();
  const options = new Map([
    ['bold', { icon: <span>B</span>, pressed: false, onClick: bold }],
    ['heading-1', { icon: <span>H1</span>, pressed: false, onClick: heading }],
  ]);
  render(
    <TooltipProvider>
      <FixedToolbarContents
        editor={{} as Editor}
        options={options}
        toolsLabel={toolsLabel}
        imageUpload={false}
        videoUpload={false}
        uploadingImage={false}
        uploadingVideo={false}
        onImage={vi.fn()}
        onVideo={vi.fn()}
      />
    </TooltipProvider>
  );
  return { heading, bold };
}

describe('optional compact document toolbar', () => {
  it('retains the existing full toolbar by default', () => {
    const { heading } = mount();
    expect(screen.queryByRole('button', { name: 'Tools' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Heading 1' }));
    expect(heading).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Colors' })).toBeTruthy();
  });
  it('keeps primary formatting reachable and places secondary controls in Tools', () => {
    const { heading, bold } = mount('Tools');
    expect(screen.queryByRole('button', { name: 'Heading 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Colors' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(bold).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Heading 1' }));
    expect(heading).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Colors' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy tools' })).toBeTruthy();
  });
});
