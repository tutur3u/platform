import { describe, expect, it } from 'vitest';
import { CUSTOM_DATE_DIALOG_CLASS_NAMES } from './custom-date-dialog-layout';

describe('custom due date dialog layout', () => {
  it('uses its own container for responsive spacing and footer layout', () => {
    expect(CUSTOM_DATE_DIALOG_CLASS_NAMES.content).toContain('@container');
    expect(CUSTOM_DATE_DIALOG_CLASS_NAMES.header).toContain('@[36rem]:px-6');
    expect(CUSTOM_DATE_DIALOG_CLASS_NAMES.footer).toContain(
      '@[24rem]:flex-row'
    );
  });

  it('bounds the dialog to the dynamic viewport and scrolls only the body', () => {
    expect(CUSTOM_DATE_DIALOG_CLASS_NAMES.content).toContain(
      'max-h-[calc(100dvh-1rem)]'
    );
    expect(CUSTOM_DATE_DIALOG_CLASS_NAMES.content).toContain('overflow-hidden');
    expect(CUSTOM_DATE_DIALOG_CLASS_NAMES.body).toContain('min-h-0');
    expect(CUSTOM_DATE_DIALOG_CLASS_NAMES.body).toContain('overflow-y-auto');
    expect(CUSTOM_DATE_DIALOG_CLASS_NAMES.body).toContain('overflow-x-hidden');
  });
});
