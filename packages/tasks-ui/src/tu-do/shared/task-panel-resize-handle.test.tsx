import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPanelResizeHandle } from './task-panel-resize-handle';
import {
  getTaskPanelMaxWidth,
  saveTaskPanelWidth,
  TASK_PANEL_DEFAULT_WIDTH,
  TASK_PANEL_MIN_WIDTH,
} from './task-panel-width';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const panelWidth = () =>
  document.documentElement.style.getPropertyValue('--task-panel-width');

describe('TaskPanelResizeHandle', () => {
  beforeEach(() => {
    window.innerWidth = 2000;
  });
  afterEach(() => act(() => void saveTaskPanelWidth(TASK_PANEL_DEFAULT_WIDTH)));

  it('caps the panel at two fifths of the window and keeps a minimum', () => {
    expect(getTaskPanelMaxWidth()).toBe(800);
    expect(saveTaskPanelWidth(5000)).toBe(800);
    expect(saveTaskPanelWidth(10)).toBe(TASK_PANEL_MIN_WIDTH);
    expect(window.localStorage.getItem('tasks.task-panel-width')).toBe(
      String(TASK_PANEL_MIN_WIDTH)
    );
  });

  it('resizes with the arrow keys and resets on double-click', () => {
    render(<TaskPanelResizeHandle />);
    const handle = screen.getByRole('separator', { name: 'resize_panel' });
    expect(handle).toHaveAttribute('aria-valuenow', '576');

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '600');
    expect(panelWidth()).toBe('600px');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '552');

    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute('aria-valuenow', '576');
    expect(panelWidth()).toBe('576px');
  });
});
