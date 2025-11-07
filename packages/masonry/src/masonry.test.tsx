import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Masonry } from './masonry';

describe('Masonry', () => {
  it('renders children in columns', () => {
    const items = [
      <div key="1">Item 1</div>,
      <div key="2">Item 2</div>,
      <div key="3">Item 3</div>,
      <div key="4">Item 4</div>,
      <div key="5">Item 5</div>,
      <div key="6">Item 6</div>,
    ];

    const { container } = render(
      <Masonry columns={3} gap={16} breakpoints={{}}>
        {items}
      </Masonry>
    );

    // Get direct children of the container (columns)
    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    expect(columns.length).toBe(3);
  });

  it('distributes items evenly across columns', () => {
    const items = [
      <div key="1" data-testid="item-1">
        Item 1
      </div>,
      <div key="2" data-testid="item-2">
        Item 2
      </div>,
      <div key="3" data-testid="item-3">
        Item 3
      </div>,
      <div key="4" data-testid="item-4">
        Item 4
      </div>,
    ];

    const { container } = render(
      <Masonry columns={2} gap={16} breakpoints={{}}>
        {items}
      </Masonry>
    );

    // Get direct children of the container (columns)
    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    expect(columns.length).toBe(2);

    // Each column should have 2 items
    for (const column of columns) {
      expect(column.children.length).toBe(2);
    }
  });

  it('applies custom className', () => {
    const items = [<div key="1">Item 1</div>];

    const { container } = render(
      <Masonry columns={2} gap={16} className="custom-class" breakpoints={{}}>
        {items}
      </Masonry>
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('handles single column layout', () => {
    const items = [<div key="1">Item 1</div>, <div key="2">Item 2</div>];

    const { container } = render(
      <Masonry columns={1} gap={16} breakpoints={{}}>
        {items}
      </Masonry>
    );

    // Get direct children of the container (columns)
    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    expect(columns.length).toBe(1);
    if (columns[0]) {
      expect(columns[0].children.length).toBe(2);
    }
  });

  it('respects empty breakpoints and uses columns prop', () => {
    const items = [
      <div key="1">Item 1</div>,
      <div key="2">Item 2</div>,
      <div key="3">Item 3</div>,
      <div key="4">Item 4</div>,
    ];

    const { container } = render(
      <Masonry columns={4} gap={16} breakpoints={{}}>
        {items}
      </Masonry>
    );

    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    expect(columns.length).toBe(4);
  });
});
