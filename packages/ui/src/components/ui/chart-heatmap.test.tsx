import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartHeatmap } from './chart-heatmap';

const columns = [
  { key: 'd1', label: 'Nov 1', tick: '1' },
  { key: 'd2', label: 'Nov 2' },
  { key: 'd3', label: 'Nov 3' },
];
const rows = [
  { key: 'a', name: 'Tasks', label: 'Tasks', values: [0, 4, 9] },
  { key: 'b', name: 'Mail', label: 'Mail', values: [1, 0, 2] },
];

function renderHeatmap() {
  return render(
    <ChartHeatmap
      label="Commits by product and day"
      rows={rows}
      columns={columns}
      valueLabel={(value) => `${value} commits`}
      legend={{ less: 'Less', more: 'More' }}
    />
  );
}

describe('ChartHeatmap', () => {
  it('names every cell with its row, column and value', () => {
    renderHeatmap();
    expect(
      screen.getByRole('gridcell', { name: 'Tasks, Nov 3: 9 commits' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', { name: 'Mail, Nov 2: 0 commits' })
    ).toBeInTheDocument();
  });

  it('shows the tooltip on hover and hides it on leave', () => {
    renderHeatmap();
    const cell = screen.getByRole('gridcell', {
      name: 'Tasks, Nov 2: 4 commits',
    });
    fireEvent.pointerEnter(cell);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Nov 2');
    expect(tooltip).toHaveTextContent('Tasks');
    expect(tooltip).toHaveTextContent('4 commits');
    expect(cell).toHaveAttribute('aria-describedby', tooltip.id);
    fireEvent.pointerLeave(screen.getByRole('grid'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip on focus and on touch', () => {
    renderHeatmap();
    fireEvent.focus(screen.getByRole('gridcell', { name: /Mail, Nov 1/ }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 commits');
    fireEvent.pointerDown(
      screen.getByRole('gridcell', { name: /Tasks, Nov 3/ }),
      { pointerType: 'touch' }
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('9 commits');
  });

  it('moves between cells with the arrow keys and clears on Escape', () => {
    renderHeatmap();
    const start = screen.getByRole('gridcell', { name: /Tasks, Nov 3/ });
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('gridcell', { name: /Tasks, Nov 2/ })
    ).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(screen.getByRole('gridcell', { name: /Mail, Nov 2/ })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mail');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
