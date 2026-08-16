import { describe, expect, it } from 'vitest';
import { DATE_TIME_PICKER_LAYOUT_CLASS_NAMES } from './date-time-picker-layout';

describe('DateTimePicker responsive layout', () => {
  it('switches calendar and time controls from the picker container width', () => {
    expect(DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.container).toContain(
      '@container'
    );
    expect(DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.layout).toContain(
      '@[34rem]:flex-row'
    );
    expect(DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.time).toContain(
      '@[34rem]:border-l'
    );
    expect(DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.layout).not.toContain('sm:');
    expect(DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.time).not.toContain('sm:');
  });

  it('contains narrow calendars instead of letting them escape the dialog', () => {
    expect(DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.calendar).toContain('min-w-0');
    expect(DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.calendar).toContain(
      'overflow-x-auto'
    );
  });
});
