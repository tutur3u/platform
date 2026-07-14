import { describe, expect, it } from 'vitest';
import {
  getTaskCardSelectedStateToneClasses,
  getTaskCardSelectionIconToneClasses,
} from './task-card-checkbox-style';

describe('task card selection styles', () => {
  it('uses the list color for the selected-card surface and inset border', () => {
    const classes = getTaskCardSelectedStateToneClasses('RED');

    expect(classes).toContain('from-dynamic-red/15');
    expect(classes).toContain('ring-dynamic-red/55');
    expect(classes).not.toContain('primary');
  });

  it('keeps the checked control compact and removes its duplicate outer border', () => {
    const classes = getTaskCardSelectionIconToneClasses('CYAN');

    expect(classes).toContain('data-[state=checked]:border-transparent');
    expect(classes).toContain('data-[state=checked]:bg-dynamic-cyan/15');
    expect(classes).toContain('data-[state=checked]:text-dynamic-cyan');
  });
});
