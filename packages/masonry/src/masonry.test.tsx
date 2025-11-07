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
      <Masonry columns={3} gap={16}>
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
      <Masonry columns={2} gap={16}>
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
      <Masonry columns={2} gap={16} className="custom-class">
        {items}
      </Masonry>
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('handles single column layout', () => {
    const items = [<div key="1">Item 1</div>, <div key="2">Item 2</div>];

    const { container } = render(
      <Masonry columns={1} gap={16}>
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

  it('uses columns prop when breakpoints not provided (v0.3.0 fix)', () => {
    const items = [
      <div key="1">Item 1</div>,
      <div key="2">Item 2</div>,
      <div key="3">Item 3</div>,
      <div key="4">Item 4</div>,
    ];

    const { container } = render(
      <Masonry columns={4} gap={16}>
        {items}
      </Masonry>
    );

    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    expect(columns.length).toBe(4);
  });

  it('respects empty breakpoints object and uses columns prop', () => {
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

  it('applies smooth transitions when enabled', () => {
    const items = [<div key="1">Item 1</div>];

    const { container } = render(
      <Masonry columns={2} gap={16} smoothTransitions={true}>
        {items}
      </Masonry>
    );

    const mainContainer = container.firstChild as HTMLElement;
    const column = mainContainer.children[0] as HTMLElement;
    
    // Check that transition style is applied
    expect(column.style.transition).toBeTruthy();
  });

  it('handles large number of items efficiently', () => {
    const items = Array.from({ length: 100 }, (_, i) => (
      <div key={i}>Item {i}</div>
    ));

    const { container } = render(
      <Masonry columns={4} gap={16}>
        {items}
      </Masonry>
    );

    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    expect(columns.length).toBe(4);

    // Check that items are distributed (roughly 25 per column)
    const itemCounts = Array.from(columns).map((col) => col.children.length);
    const total = itemCounts.reduce((sum, count) => sum + count, 0);
    expect(total).toBe(100);

    // Each column should have approximately equal items (within 1 item difference)
    const min = Math.min(...itemCounts);
    const max = Math.max(...itemCounts);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  it('distributes items with count strategy', () => {
    const items = Array.from({ length: 9 }, (_, i) => (
      <div key={i}>Item {i}</div>
    ));

    const { container } = render(
      <Masonry columns={3} gap={16} strategy="count">
        {items}
      </Masonry>
    );

    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    
    // With 9 items and 3 columns, should have 3 items per column
    for (const column of columns) {
      expect(column.children.length).toBe(3);
    }
  });

  it('applies custom balance threshold', () => {
    const items = [
      <div key="1">Item 1</div>,
      <div key="2">Item 2</div>,
      <div key="3">Item 3</div>,
    ];

    const { container } = render(
      <Masonry columns={2} gap={16} strategy="balanced" balanceThreshold={0.1}>
        {items}
      </Masonry>
    );

    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    expect(columns.length).toBe(2);
  });

  it('handles zero items gracefully', () => {
    const { container } = render(<Masonry columns={3} gap={16}>{[]}</Masonry>);

    const mainContainer = container.firstChild as HTMLElement;
    const columns = mainContainer.children;
    expect(columns.length).toBe(3);
    
    // All columns should be empty
    for (const column of columns) {
      expect(column.children.length).toBe(0);
    }
  });
});
