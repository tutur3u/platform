import { describe, expect, it } from 'vitest';
import {
  getTaskCardSelectedStateToneClasses,
  getTaskCardSelectionIconToneClasses,
  TASK_CARD_SELECTED_STATE_BASE_CLASSES,
  TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES,
} from './task-card-checkbox-style';

describe('task card selection styles', () => {
  it('uses the list color for the selected-card surface and inset border', () => {
    const classes = getTaskCardSelectedStateToneClasses('RED');

    expect(classes).toContain('from-dynamic-red/15');
    expect(classes).toContain('ring-dynamic-red/55');
    expect(classes).not.toContain('primary');
  });

  it('keeps the control geometry fixed and compact across selection states', () => {
    expect(TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES).toContain('size-4');
    expect(TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES).not.toContain(
      'size-[18px]'
    );
    expect(TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES).not.toContain(
      'translate-y'
    );
    expect(TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES).not.toContain('scale-');
  });

  it('uses the list color without coupling its tone to a DOM state attribute', () => {
    const classes = getTaskCardSelectionIconToneClasses('CYAN');

    expect(classes).toContain('border-dynamic-cyan/70');
    expect(classes).toContain('bg-dynamic-cyan/5');
    expect(classes).toContain('text-dynamic-cyan');
    expect(classes).not.toContain('data-[');
  });

  it('does not change the card border width when selected', () => {
    expect(TASK_CARD_SELECTED_STATE_BASE_CLASSES).not.toContain('border-l-');
    expect(TASK_CARD_SELECTED_STATE_BASE_CLASSES).toContain('ring-inset');
  });
});
