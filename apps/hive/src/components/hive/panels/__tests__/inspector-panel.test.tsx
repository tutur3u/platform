import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../../../messages/en.json';
import { InspectorPanel } from '../inspector-panel';

const world = {
  blocks: [
    {
      id: 'block:0:0:0',
      position: { x: 0, y: 0, z: 0 },
      type: 'crop-soil',
    },
  ],
  objects: [
    {
      id: 'object:crop:0:1:0',
      position: { x: 0, y: 1, z: 0 },
      type: 'crop',
    },
  ],
};

function renderInspector(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('InspectorPanel', () => {
  it('shows tile metadata and requests selected entity deletion', () => {
    const onRequestDelete = vi.fn();

    renderInspector(
      <InspectorPanel
        npcs={[]}
        onPatchBlock={vi.fn()}
        onPatchNpc={vi.fn()}
        onPatchObject={vi.fn()}
        onRequestDelete={onRequestDelete}
        onToggle={vi.fn()}
        selection={{ id: 'block:0:0:0', kind: 'block' }}
        world={world}
      />
    );

    expect(screen.getByText('Surface height')).toBeTruthy();
    expect(screen.getByText('crop')).toBeTruthy();
    expect(screen.queryByText('Observability')).toBeNull();
    expect(screen.getByText('Transform')).toBeTruthy();
    expect(screen.getByText('Style')).toBeTruthy();

    fireEvent.click(screen.getByText('Delete selected'));
    expect(onRequestDelete).toHaveBeenCalledWith({
      id: 'block:0:0:0',
      kind: 'block',
    });
  });

  it('persists transform and color edits through patch handlers', () => {
    const onPatchBlock = vi.fn();

    renderInspector(
      <InspectorPanel
        npcs={[]}
        onPatchBlock={onPatchBlock}
        onPatchNpc={vi.fn()}
        onPatchObject={vi.fn()}
        onRequestDelete={vi.fn()}
        onToggle={vi.fn()}
        selection={{ id: 'block:0:0:0', kind: 'block' }}
        world={world}
      />
    );

    const xInput = screen.getAllByLabelText('X')[0] as HTMLInputElement;
    fireEvent.change(xInput, { target: { value: '1' } });
    fireEvent.blur(xInput);

    expect(onPatchBlock).toHaveBeenCalledWith('block:0:0:0', {
      position: { x: 1, y: 0, z: 0 },
    });

    const primaryColor = screen.getAllByLabelText('Primary color')[0]!;
    expect(primaryColor).toBeTruthy();
    fireEvent.change(primaryColor, { target: { value: '#ffcc00' } });

    expect(onPatchBlock).toHaveBeenCalledWith('block:0:0:0', {
      state: { color: '#ffcc00' },
    });
  });
});
