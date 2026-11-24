// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Boundary } from './layout-geometry';
import { LayoutSeparator } from './layout-separator';

const boundary = (now: number): Boundary => ({
  key: 's1:0',
  splitId: 's1',
  index: 0,
  axis: 'row',
  at: now / 100,
  span: { x: 0, y: 0, w: 1, h: 1 },
  now,
  min: 15,
  max: 85,
  before: 'p1',
  after: 'p2',
});

function setup() {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const onReset = vi.fn();
  // What the stage around it would do with Escape, such as closing a dialog.
  const parent = vi.fn();
  const view = (now: number) => (
    <div onKeyDown={parent}>
      <LayoutSeparator
        boundary={boundary(now)}
        label="Resize"
        extent={() => 1000}
        onPreview={() => {}}
        onCommit={onCommit}
        onCancel={onCancel}
        onReset={onReset}
      />
    </div>
  );
  const rendered = render(view(50));
  const separator = rendered.getByRole('separator');
  // The stage saves each step, so the separator comes back at the new place.
  const stepTo = (key: string, now: number) => {
    fireEvent.keyDown(separator, { key });
    rendered.rerender(view(now));
  };
  return { separator, stepTo, parent, onCommit, onCancel, onReset };
}

afterEach(cleanup);

it('puts back where keyboard resizing started on Escape', () => {
  const { separator, stepTo, parent, onCommit } = setup();
  stepTo('ArrowRight', 55);
  stepTo('ArrowRight', 60);
  expect(onCommit).toHaveBeenLastCalledWith(60);
  parent.mockClear();
  fireEvent.keyDown(separator, { key: 'Escape' });
  expect(onCommit).toHaveBeenLastCalledWith(50);
  // Handled here, so a dialog around the stage stays open.
  expect(parent).not.toHaveBeenCalled();
});

it('lets Escape through when there is nothing to undo', () => {
  const { separator, parent, onCommit } = setup();
  fireEvent.keyDown(separator, { key: 'Escape' });
  expect(onCommit).not.toHaveBeenCalled();
  expect(parent).toHaveBeenCalled();
});

it('starts a new round after focus leaves', () => {
  const { separator, stepTo, onCommit } = setup();
  stepTo('ArrowRight', 55);
  fireEvent.blur(separator);
  stepTo('ArrowRight', 60);
  fireEvent.keyDown(separator, { key: 'Escape' });
  expect(onCommit).toHaveBeenLastCalledWith(55);
});

it('drops a drag in progress on Escape without saving it', () => {
  const { separator, onCommit, onCancel } = setup();
  fireEvent.pointerDown(separator, { button: 0, pointerId: 1, clientX: 500 });
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: 600 });
  fireEvent.keyDown(separator, { key: 'Escape' });
  expect(onCancel).toHaveBeenCalledTimes(1);
  fireEvent.pointerUp(separator, { pointerId: 1 });
  expect(onCommit).not.toHaveBeenCalled();
});
