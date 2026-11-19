import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MediaPreviewDialog,
  type MediaPreviewItem,
} from './media-preview-dialog';

const items: MediaPreviewItem[] = ['One', 'Two', 'Three'].map((title, i) => ({
  src: `/shot-${i}.webp`,
  alt: `${title} alt`,
  width: 600,
  height: 1200,
  title,
  details: ['Store', 'Phone', 'English'],
}));
const labels = {
  close: 'Close',
  previous: 'Previous',
  next: 'Next',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  thumbnails: 'All screenshots',
  counter: (index: number, total: number) => `${index} of ${total}`,
};

function Harness({
  onOpenChange = () => {},
}: {
  onOpenChange?: (o: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  return (
    <MediaPreviewDialog
      open
      items={items}
      index={index}
      onIndexChange={setIndex}
      onOpenChange={onOpenChange}
      labels={labels}
    />
  );
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('MediaPreviewDialog', () => {
  it('shows the caption, details and counter', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'One' });
    expect(dialog).toHaveTextContent('Store · Phone · English');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('steps with the arrow keys and the edge buttons, stopping at the ends', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Two' })).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('jumps from a thumbnail', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Three' }));
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
  });

  it('swipes to the next and previous items', () => {
    render(<Harness />);
    const stage = screen.getByAltText('One alt').parentElement as HTMLElement;
    fireEvent.pointerDown(stage, { clientX: 300, clientY: 100, button: 0 });
    fireEvent.pointerUp(stage, { clientX: 150, clientY: 110 });
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    const next = screen.getByAltText('Two alt').parentElement as HTMLElement;
    fireEvent.pointerDown(next, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(next, { clientX: 260, clientY: 100 });
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('ignores a mostly vertical drag', () => {
    render(<Harness />);
    const stage = screen.getByAltText('One alt').parentElement as HTMLElement;
    fireEvent.pointerDown(stage, { clientX: 300, clientY: 100, button: 0 });
    fireEvent.pointerUp(stage, { clientX: 240, clientY: 300 });
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('zooms with the buttons and keys, and resets when stepping', () => {
    render(<Harness />);
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    expect(zoomOut).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(zoomOut).toBeEnabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '0' });
    expect(zoomOut).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '+' });
    expect(zoomOut).toBeEnabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('closes with Escape and the close button', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });
});
