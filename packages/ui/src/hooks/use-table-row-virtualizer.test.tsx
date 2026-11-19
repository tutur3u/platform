/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { useTableRowVirtualizer } from './use-table-row-virtualizer';

function WindowedTable({ count }: { count: number }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rows = useTableRowVirtualizer({ count, scrollRef });
  return (
    <div ref={scrollRef} data-testid="scroll">
      <table>
        <tbody>
          <tr data-testid="top" style={{ height: rows.paddingTop }} />
          {rows.indexes.map((index) => (
            <tr data-index={index} key={index} ref={rows.measureRow}>
              <td>Row {index}</td>
            </tr>
          ))}
          <tr data-testid="bottom" style={{ height: rows.paddingBottom }} />
        </tbody>
      </table>
    </div>
  );
}

describe('useTableRowVirtualizer', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
  });

  it('renders a first-screen window of a long table, with a spacer for the rest', () => {
    render(<WindowedTable count={500} />);

    const rendered = document.querySelectorAll('tr[data-index]').length;
    expect(screen.getByText('Row 0')).toBeTruthy();
    expect(screen.queryByText('Row 499')).toBeNull();
    expect(rendered).toBeGreaterThanOrEqual(20);
    expect(rendered).toBeLessThan(500);
    expect(screen.getByTestId('top').style.height).toBe('0px');
    expect(
      Number.parseInt(screen.getByTestId('bottom').style.height, 10)
    ).toBeGreaterThan(0);
  });

  it('renders every row of a short table with no spacers', () => {
    render(<WindowedTable count={5} />);

    expect(document.querySelectorAll('tr[data-index]')).toHaveLength(5);
    expect(screen.getByTestId('bottom').style.height).toBe('0px');
  });
});
